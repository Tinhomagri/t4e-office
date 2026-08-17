"""Deletar card: só admin ou quem recebeu grant explícito pode."""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import (
    CardModel,
    ProjectDeleteGrantModel,
    ProjectModel,
)


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    dev = UserModel.objects.create_user(
        email="dev@t4e.com", password="x", full_name="Dev", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    MembershipModel.objects.create(workspace=ws, user=dev, role="member")
    project = ProjectModel.objects.create(
        workspace=ws, name="Proj", key="PRJ", visibility="workspace"
    )
    card = CardModel.objects.create(project=project, number=1, title="Card")
    owner_client = APIClient()
    owner_client.force_authenticate(user=owner)
    dev_client = APIClient()
    dev_client.force_authenticate(user=dev)
    return {
        "owner": owner, "dev": dev, "project": project, "card": card,
        "owner_client": owner_client, "dev_client": dev_client,
    }


def test_admin_deleta_card(scenario):
    resp = scenario["owner_client"].delete(f"/api/cards/{scenario['card'].id}/")
    assert resp.status_code == 204
    assert not CardModel.objects.filter(id=scenario["card"].id).exists()


def test_developer_sem_grant_e_bloqueado(scenario):
    resp = scenario["dev_client"].delete(f"/api/cards/{scenario['card'].id}/")
    assert resp.status_code == 403
    assert CardModel.objects.filter(id=scenario["card"].id).exists()


def test_developer_com_grant_deleta(scenario):
    ProjectDeleteGrantModel.objects.create(
        project=scenario["project"], user_id=scenario["dev"].id
    )
    resp = scenario["dev_client"].delete(f"/api/cards/{scenario['card'].id}/")
    assert resp.status_code == 204
    assert not CardModel.objects.filter(id=scenario["card"].id).exists()


def test_developer_nao_concede_grant_a_si_mesmo(scenario):
    resp = scenario["dev_client"].put(
        f"/api/projects/{scenario['project'].id}/delete-grant/",
        {"user_id": str(scenario["dev"].id)},
    )
    assert resp.status_code == 403
    assert not ProjectDeleteGrantModel.objects.filter(
        project=scenario["project"], user_id=scenario["dev"].id
    ).exists()


def test_admin_concede_e_revoga_grant(scenario):
    project = scenario["project"]
    dev_id = str(scenario["dev"].id)

    resp = scenario["owner_client"].put(
        f"/api/projects/{project.id}/delete-grant/", {"user_id": dev_id}
    )
    assert resp.status_code == 200
    assert resp.data["can_delete_cards"] is True
    assert ProjectDeleteGrantModel.objects.filter(project=project, user_id=dev_id).exists()

    resp = scenario["owner_client"].delete(
        f"/api/projects/{project.id}/delete-grant/", {"user_id": dev_id}
    )
    assert resp.status_code == 200
    assert resp.data["can_delete_cards"] is False
    assert not ProjectDeleteGrantModel.objects.filter(
        project=project, user_id=dev_id
    ).exists()
