"""Worker: acha a transcrição de reuniões vinculadas a um projeto e salva
como Documento.

O Meet solta a transcrição no Drive de quem organizou a reunião só um tempo
depois dela terminar — sem hora certa. Por isso isto é POLLING, não evento:
roda de tempos em tempos e vai checando se já apareceu.

Deve ser chamado pelo cron do sistema (mesma abordagem de
`send_meeting_reminders`), por exemplo a cada 15 minutos:
    */15 * * * * /app/.venv/bin/python manage.py check_meeting_transcripts

Cada execução olha reuniões com projeto vinculado, já terminadas e sem
transcrição salva ainda, busca no Drive um arquivo com o título da reunião
modificado depois do fim dela, e — achando — grava como Documento do projeto.
`--max-age-days` (default 3) para de tentar reuniões muito antigas: se a
transcrição não saiu em alguns dias, não vai sair mais.
"""
from datetime import UTC, datetime, timedelta

from django.core.management.base import BaseCommand
from django.utils.html import escape

from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
    GoogleNotConnectedError,
)
from contexts.google.application.use_cases.read_drive_document import (
    ReadDriveDocument,
)
from contexts.google.application.use_cases.search_drive_files import SearchDriveFiles
from contexts.google.domain.ports.drive_gateway import DriveError
from contexts.google.infrastructure.django.drive_gateway_impl import (
    GoogleDriveGateway,
)
from contexts.google.infrastructure.django.models import MeetingRefModel
from contexts.google.infrastructure.django.oauth_provider_impl import (
    GoogleOAuthProvider,
)
from contexts.google.infrastructure.django.repositories_impl import (
    DjangoConnectionRepository,
)
from contexts.projects.infrastructure.django.models import DocumentModel

# Meet salva a transcrição como Google Doc — outros tipos que a busca traga
# (planilha de outro assunto, PDF antigo com nome parecido) não são isso.
_GOOGLE_DOC = "application/vnd.google-apps.document"


def _para_html(texto: str) -> str:
    """Texto puro da transcrição em parágrafos HTML — é o formato que o
    editor de Documentos espera (`DocumentModel.content` é rich-text)."""
    linhas = [escape(linha) for linha in texto.splitlines() if linha.strip()]
    return "".join(f"<p>{linha}</p>" for linha in linhas)


class Command(BaseCommand):
    help = "Acha a transcrição de reuniões vinculadas a um projeto e salva como Documento."

    def add_arguments(self, parser):
        parser.add_argument(
            "--max-age-days",
            type=int,
            default=3,
            help="Para de tentar reuniões terminadas há mais dias que isto (default 3).",
        )

    def handle(self, *args, **options):
        now = datetime.now(UTC)
        cutoff = now - timedelta(days=options["max_age_days"])

        pendentes = MeetingRefModel.objects.filter(
            project_id__isnull=False,
            transcript_saved_at__isnull=True,
            meeting_end__isnull=False,
            meeting_end__lte=now,
            meeting_end__gte=cutoff,
        ).select_related("project")

        credentials = GetValidCredentials(
            oauth_provider=GoogleOAuthProvider(),
            connection_repository=DjangoConnectionRepository(),
        )
        search = SearchDriveFiles(
            drive_gateway=GoogleDriveGateway(), get_valid_credentials=credentials
        )
        read = ReadDriveDocument(
            drive_gateway=GoogleDriveGateway(), get_valid_credentials=credentials
        )

        salvos = 0
        for ref in pendentes:
            try:
                achados = search.execute(
                    user_id=str(ref.user_id), query=ref.title, max_results=5
                )
            except (DriveError, GoogleNotConnectedError):
                continue

            # Só depois do fim da reunião, e só Doc — descarta lixo de nome
            # parecido que já existia antes dela acontecer.
            candidatos = [
                f
                for f in achados
                if f.mime_type == _GOOGLE_DOC
                and f.modified_time
                and datetime.fromisoformat(f.modified_time.replace("Z", "+00:00"))
                >= ref.meeting_end
            ]
            if not candidatos:
                continue
            escolhido = candidatos[0]

            try:
                texto = read.execute(user_id=str(ref.user_id), file_id=escolhido.file_id)
            except DriveError:
                continue

            DocumentModel.objects.create(
                project_id=ref.project_id,
                title=f"Transcrição — {ref.title}",
                content=_para_html(texto),
                created_by=ref.user_id,
                updated_by=ref.user_id,
            )
            ref.transcript_saved_at = now
            ref.save(update_fields=["transcript_saved_at"])
            salvos += 1

        self.stdout.write(self.style.SUCCESS(f"{salvos} transcrição(ões) salva(s)."))
