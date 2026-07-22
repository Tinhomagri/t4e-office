"""Adaptador que agenda reuniões via API pública do contexto google.

Fronteira: `sales` chama o caso de uso `CreateMeeting` de `google`. A montagem
das dependências concretas desse caso de uso (gateway/repositórios) acontece
aqui — mesmo padrão usado pelas views do próprio contexto `google` — e fica
isolada neste único arquivo, fora do domínio e da aplicação de `sales`.
"""
from datetime import datetime

from contexts.google.application.use_cases.create_meeting import CreateMeeting
from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
    GoogleNotConnectedError,
)
from contexts.google.domain.ports.calendar_gateway import CalendarError
from contexts.google.infrastructure.django.calendar_gateway_impl import (
    GoogleCalendarGateway,
)
from contexts.google.infrastructure.django.oauth_provider_impl import GoogleOAuthProvider
from contexts.google.infrastructure.django.repositories_impl import (
    DjangoConnectionRepository,
    DjangoMeetingRefRepository,
)
from contexts.sales.domain.ports.meeting_scheduler import (
    MeetingScheduler,
    MeetingSchedulerUnavailableError,
    ScheduledMeeting,
)


class GoogleMeetingScheduler(MeetingScheduler):
    """Cria o evento de agenda da reunião comercial no Google Calendar."""

    def schedule(
        self,
        *,
        user_id: str,
        title: str,
        start: datetime,
        end: datetime,
        attendees: list[str],
        description: str = "",
    ) -> ScheduledMeeting:
        use_case = CreateMeeting(
            calendar_gateway=GoogleCalendarGateway(),
            get_valid_credentials=GetValidCredentials(
                oauth_provider=GoogleOAuthProvider(),
                connection_repository=DjangoConnectionRepository(),
            ),
            meeting_ref_repository=DjangoMeetingRefRepository(),
        )
        try:
            created = use_case.execute(
                user_id=user_id,
                title=title,
                start=start,
                end=end,
                attendees=attendees,
                description=description,
            )
        except (GoogleNotConnectedError, CalendarError) as exc:
            # Degrada: a atividade é criada sem evento e a API devolve um aviso
            raise MeetingSchedulerUnavailableError(str(exc)) from exc
        return ScheduledMeeting(
            event_id=created.event_id,
            meet_url=created.meet_link or "",
            html_link=created.html_link or "",
        )
