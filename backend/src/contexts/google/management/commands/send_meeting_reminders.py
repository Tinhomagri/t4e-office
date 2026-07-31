"""Worker: notifica no app quem tem reunião com Meet começando em breve.

Deve ser chamado pelo cron do sistema a cada minuto (mesma abordagem de
`publish_due_posts`):
    * * * * * /app/.venv/bin/python manage.py send_meeting_reminders

Cada execução olha os próximos `--lead-minutes` (default 10) de cada usuário
com conexão Google ativa e cria uma notificação in-app para reuniões com Meet
que ainda não foram avisadas — dedupe por link do evento, então rodar de novo
antes da call não duplica o aviso.
"""
from datetime import UTC, datetime, timedelta

from django.core.management.base import BaseCommand

from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
    GoogleNotConnectedError,
)
from contexts.google.application.use_cases.list_upcoming_events import (
    ListUpcomingEvents,
)
from contexts.google.domain.ports.calendar_gateway import CalendarError
from contexts.google.infrastructure.django.calendar_gateway_impl import (
    GoogleCalendarGateway,
)
from contexts.google.infrastructure.django.models import GoogleConnectionModel
from contexts.google.infrastructure.django.oauth_provider_impl import (
    GoogleOAuthProvider,
)
from contexts.google.infrastructure.django.repositories_impl import (
    DjangoConnectionRepository,
)
from contexts.projects.infrastructure.django.models import NotificationModel
from contexts.projects.interface.api.notification_views import notify


class Command(BaseCommand):
    help = "Notifica no app reuniões com Meet que começam em breve."

    def add_arguments(self, parser):
        parser.add_argument(
            "--lead-minutes",
            type=int,
            default=10,
            help="Janela de antecedência do aviso, em minutos (default 10).",
        )

    def handle(self, *args, **options):
        lead = options["lead_minutes"]
        now = datetime.now(UTC)
        window_end = now + timedelta(minutes=lead)

        use_case = ListUpcomingEvents(
            calendar_gateway=GoogleCalendarGateway(),
            get_valid_credentials=GetValidCredentials(
                oauth_provider=GoogleOAuthProvider(),
                connection_repository=DjangoConnectionRepository(),
            ),
        )

        notified = 0
        for user_id in GoogleConnectionModel.objects.filter(
            status="active"
        ).values_list("user_id", flat=True):
            user_id = str(user_id)
            try:
                events = use_case.execute(
                    user_id=user_id, time_min=now, time_max=window_end
                )
            except (CalendarError, GoogleNotConnectedError):
                continue

            for event in events:
                if not event.meet_link or event.all_day:
                    continue
                if NotificationModel.objects.filter(
                    user_id=user_id, type="meeting_reminder", link=event.meet_link
                ).exists():
                    continue
                mins = max(0, round((event.start - now).total_seconds() / 60))
                notify(
                    user_id,
                    "meeting_reminder",
                    title=f"\"{event.title}\" começa em {mins} min",
                    body="Clique para entrar na call.",
                    link=event.meet_link,
                )
                notified += 1

        self.stdout.write(self.style.SUCCESS(f"{notified} lembrete(s) de reunião enviados."))
