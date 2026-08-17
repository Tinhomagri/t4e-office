"""O Meet solta a transcrição no Drive sem hora certa — o comando faz o
polling: acha, salva como Documento do projeto, marca pra não tentar de novo.
"""
from datetime import UTC, datetime, timedelta

import pytest
from django.core.management import call_command

from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.domain.entities.drive_file import DriveFile
from contexts.google.infrastructure.django.drive_gateway_impl import (
    GoogleDriveGateway,
)
from contexts.google.infrastructure.django.models import MeetingRefModel
from contexts.identity.infrastructure.django.models import UserModel, WorkspaceModel
from contexts.projects.infrastructure.django.models import DocumentModel, ProjectModel


@pytest.fixture
def cenario(db, monkeypatch):
    dono = UserModel.objects.create_user(
        email="dono@t4e.com", password="x", full_name="Dono", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="T4E", slug="t4e", owner=dono)
    projeto = ProjectModel.objects.create(workspace=ws, name="Proj", key="PRJ")

    monkeypatch.setattr(GetValidCredentials, "execute", lambda self, *, user_id: "token-fake")
    return {"dono": dono, "ws": ws, "projeto": projeto}


def _ref(projeto, dono, *, minutos_atras=30, transcript_saved_at=None):
    fim = datetime.now(UTC) - timedelta(minutes=minutos_atras)
    return MeetingRefModel.objects.create(
        user=dono,
        google_event_id="evt-1",
        project=projeto,
        title="Reunião com cliente",
        meeting_end=fim,
        transcript_saved_at=transcript_saved_at,
    )


@pytest.mark.django_db
def test_acha_transcricao_e_salva_como_documento(cenario, monkeypatch):
    ref = _ref(cenario["projeto"], cenario["dono"])
    depois_da_reuniao = (ref.meeting_end + timedelta(minutes=5)).isoformat().replace("+00:00", "Z")

    monkeypatch.setattr(
        GoogleDriveGateway,
        "search_files",
        lambda self, *, access_token, query, max_results=10: [
            DriveFile(
                file_id="doc-1",
                name="Reunião com cliente - Transcrição",
                mime_type="application/vnd.google-apps.document",
                modified_time=depois_da_reuniao,
                web_view_link="https://drive/doc-1",
            )
        ],
    )
    monkeypatch.setattr(
        GoogleDriveGateway,
        "read_text",
        lambda self, *, access_token, file_id: "Ana: vamos fechar o escopo.\nBruno: combinado.",
    )

    call_command("check_meeting_transcripts")

    ref.refresh_from_db()
    assert ref.transcript_saved_at is not None
    doc = DocumentModel.objects.get(project=cenario["projeto"])
    assert doc.title == "Transcrição — Reunião com cliente"
    assert "vamos fechar o escopo" in doc.content
    assert "<p>" in doc.content


@pytest.mark.django_db
def test_arquivo_anterior_a_reuniao_e_ignorado(cenario, monkeypatch):
    """Um Doc de outra reunião com nome parecido, de ANTES desta acontecer,
    não pode virar transcrição — ainda não existe o que ele deveria conter."""
    ref = _ref(cenario["projeto"], cenario["dono"])
    antes_da_reuniao = (ref.meeting_end - timedelta(days=10)).isoformat().replace("+00:00", "Z")

    monkeypatch.setattr(
        GoogleDriveGateway,
        "search_files",
        lambda self, *, access_token, query, max_results=10: [
            DriveFile(
                file_id="doc-velho",
                name="Reunião com cliente - Transcrição",
                mime_type="application/vnd.google-apps.document",
                modified_time=antes_da_reuniao,
                web_view_link="https://drive/doc-velho",
            )
        ],
    )

    call_command("check_meeting_transcripts")

    ref.refresh_from_db()
    assert ref.transcript_saved_at is None
    assert not DocumentModel.objects.filter(project=cenario["projeto"]).exists()


@pytest.mark.django_db
def test_reuniao_ja_processada_nao_e_reconsultada(cenario, monkeypatch):
    _ref(cenario["projeto"], cenario["dono"], transcript_saved_at=datetime.now(UTC))
    chamou = []
    monkeypatch.setattr(
        GoogleDriveGateway,
        "search_files",
        lambda self, **kw: chamou.append(1) or [],
    )

    call_command("check_meeting_transcripts")

    assert chamou == []


@pytest.mark.django_db
def test_reuniao_sem_projeto_e_ignorada(cenario, monkeypatch):
    MeetingRefModel.objects.create(
        user=cenario["dono"],
        google_event_id="evt-2",
        project=None,
        title="Reunião interna",
        meeting_end=datetime.now(UTC) - timedelta(minutes=30),
    )
    chamou = []
    monkeypatch.setattr(
        GoogleDriveGateway,
        "search_files",
        lambda self, **kw: chamou.append(1) or [],
    )

    call_command("check_meeting_transcripts")

    assert chamou == []
