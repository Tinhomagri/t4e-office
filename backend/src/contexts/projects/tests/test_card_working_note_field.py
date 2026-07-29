"""Confere que CardModel tem o campo working_note com o default certo."""
import pytest

from contexts.identity.infrastructure.django.models import UserModel, WorkspaceModel
from contexts.projects.infrastructure.django.models import CardModel, ProjectModel


@pytest.fixture
def card(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Ana Owner", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    project = ProjectModel.objects.create(workspace=ws, name="Mia", key="MIA")
    return CardModel.objects.create(project=project, number=1, title="Card 1")


def test_working_note_tem_default_string_vazia(card):
    assert card.working_note == ""


def test_working_note_aceita_texto_livre(card):
    card.working_note = "travado esperando review"
    card.save(update_fields=["working_note"])
    card.refresh_from_db()
    assert card.working_note == "travado esperando review"
