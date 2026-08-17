"""Regressão de multi-tenancy: o guard de permissão fecha vazamento entre
workspaces. Cobre o helper usado por todas as views cruas (extra/reports/
automation) e pelo branch JQL de cards."""
import pytest

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import CardModel, ProjectModel
from contexts.projects.interface.api.permissions import (
    assert_card_member,
    assert_project_member,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    outsider = UserModel.objects.create_user(
        email="outsider@t4e.com", password="x", full_name="Outsider", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    project = ProjectModel.objects.create(
        workspace=ws, name="Proj", key="PRJ", visibility="workspace"
    )
    card = CardModel.objects.create(project=project, number=1, title="Card")
    return {"owner": owner, "outsider": outsider, "project": project, "card": card}


def test_membro_acessa_projeto(scenario):
    proj = assert_project_member(
        project_id=str(scenario["project"].id), user_id=str(scenario["owner"].id)
    )
    assert proj.id == scenario["project"].id


def test_nao_membro_e_bloqueado_no_projeto(scenario):
    with pytest.raises(PermissionDeniedError):
        assert_project_member(
            project_id=str(scenario["project"].id),
            user_id=str(scenario["outsider"].id),
        )


def test_nao_membro_e_bloqueado_no_card(scenario):
    with pytest.raises(PermissionDeniedError):
        assert_card_member(
            card_id=str(scenario["card"].id), user_id=str(scenario["outsider"].id)
        )


def test_projeto_inexistente_404(scenario):
    import uuid

    with pytest.raises(NotFoundError):
        assert_project_member(
            project_id=str(uuid.uuid4()), user_id=str(scenario["owner"].id)
        )


# ── Capacidades (Domínio 12) ──────────────────────────────────────────────────

@pytest.fixture
def member_scenario(scenario, db):
    """Adiciona um membro comum (role=member → developer no projeto)."""
    from contexts.identity.infrastructure.django.models import MembershipModel

    dev = UserModel.objects.create_user(
        email="dev@t4e.com", password="x", full_name="Dev", is_active=True
    )
    ws_id = scenario["project"].workspace_id
    MembershipModel.objects.create(workspace_id=ws_id, user=dev, role="member")
    scenario["dev"] = dev
    return scenario


def test_owner_e_admin_no_projeto(scenario):
    from contexts.projects.interface.api.capabilities import (
        ADMINISTER_PROJECT,
        effective_role,
    )

    assert effective_role(scenario["project"], str(scenario["owner"].id)) == "admin"
    from contexts.projects.interface.api.capabilities import capabilities_for

    assert ADMINISTER_PROJECT in capabilities_for(
        scenario["project"], str(scenario["owner"].id)
    )


def test_member_e_developer_sem_manage_custom_fields(member_scenario):
    from contexts.projects.interface.api.capabilities import (
        CREATE_ISSUE,
        MANAGE_CUSTOM_FIELDS,
        capabilities_for,
        effective_role,
    )

    proj = member_scenario["project"]
    dev_id = str(member_scenario["dev"].id)
    assert effective_role(proj, dev_id) == "developer"
    caps = capabilities_for(proj, dev_id)
    assert CREATE_ISSUE in caps
    assert MANAGE_CUSTOM_FIELDS not in caps


def test_atribuicao_explicita_sobrepoe(member_scenario):
    """Atribuir o developer ao papel admin do projeto eleva as capacidades."""
    from contexts.projects.infrastructure.django.models import (
        ProjectRoleMemberModel,
        ProjectRoleModel,
    )
    from contexts.projects.interface.api.capabilities import (
        ADMINISTER_PROJECT,
        capabilities_for,
    )

    proj = member_scenario["project"]
    dev_id = str(member_scenario["dev"].id)
    admin_role = ProjectRoleModel.objects.create(
        project=proj, name="Administrador", slug="admin"
    )
    ProjectRoleMemberModel.objects.create(role=admin_role, user_id=dev_id)
    assert ADMINISTER_PROJECT in capabilities_for(proj, dev_id)


def test_developer_nao_deleta_card_sem_grant(member_scenario):
    from contexts.projects.interface.api.capabilities import DELETE_ISSUE, capabilities_for

    proj = member_scenario["project"]
    dev_id = str(member_scenario["dev"].id)
    assert DELETE_ISSUE not in capabilities_for(proj, dev_id)


def test_developer_deleta_card_com_grant(member_scenario):
    from contexts.projects.infrastructure.django.models import ProjectDeleteGrantModel
    from contexts.projects.interface.api.capabilities import DELETE_ISSUE, capabilities_for

    proj = member_scenario["project"]
    dev_id = str(member_scenario["dev"].id)
    ProjectDeleteGrantModel.objects.create(project=proj, user_id=dev_id)
    assert DELETE_ISSUE in capabilities_for(proj, dev_id)


def test_admin_deleta_card_sem_precisar_de_grant(scenario):
    from contexts.projects.interface.api.capabilities import DELETE_ISSUE, capabilities_for

    assert DELETE_ISSUE in capabilities_for(
        scenario["project"], str(scenario["owner"].id)
    )
