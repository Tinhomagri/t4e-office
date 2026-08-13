"""Quem enxerga qual board.

A maioria do time trabalha em poucos projetos; ver os 33 não é só ruído, é
acesso a informação de cliente que não lhe diz respeito. Estes testes prendem
as duas metades da regra: sumir da LISTA e barrar o acesso DIRETO. Esconder na
tela sem barrar no servidor seria pior que não ter permissão — pareceria
protegido.
"""
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import (
    CardModel,
    ProjectModel,
    ProjectRoleMemberModel,
    ProjectRoleModel,
)


@pytest.fixture
def cenario(db):
    dono = UserModel.objects.create_user(
        email="dono@t4e.com", password="x", full_name="Dono", is_active=True
    )
    dev = UserModel.objects.create_user(
        email="dev@t4e.com", password="x", full_name="Dev", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="T4E", slug="t4e", owner=dono)
    MembershipModel.objects.create(workspace=ws, user=dono, role="owner")
    MembershipModel.objects.create(workspace=ws, user=dev, role="member")

    meu = ProjectModel.objects.create(workspace=ws, name="Meu", key="MEU")
    alheio = ProjectModel.objects.create(workspace=ws, name="Alheio", key="ALH")
    aberto = ProjectModel.objects.create(
        workspace=ws, name="Aberto", key="ABE", visibility="workspace"
    )

    papel = ProjectRoleModel.objects.create(project=meu, name="Desenvolvedor", slug="developer")
    ProjectRoleMemberModel.objects.create(role=papel, user_id=dev.id)
    return {"ws": ws, "dono": dono, "dev": dev, "meu": meu, "alheio": alheio, "aberto": aberto}


def _cli(user) -> APIClient:
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_projeto_nasce_restrito(cenario):
    # Abrir depois é decisão consciente; descobrir que estava aberto, não.
    assert ProjectModel.objects.create(
        workspace=cenario["ws"], name="Novo", key="NOV"
    ).visibility == "restricted"


@pytest.mark.django_db
def test_membro_ve_so_onde_tem_papel_ou_o_que_esta_aberto(cenario):
    r = _cli(cenario["dev"]).get(reverse("project-list-create"), {"workspace_id": str(cenario["ws"].id)})

    chaves = sorted(p["key"] for p in r.json())
    assert chaves == ["ABE", "MEU"]


@pytest.mark.django_db
def test_owner_do_workspace_ve_todos(cenario):
    # Sem isto, fechar todos os projetos trancaria a chave do lado de fora: a
    # tela de permissões se acessa a partir do projeto.
    r = _cli(cenario["dono"]).get(reverse("project-list-create"), {"workspace_id": str(cenario["ws"].id)})

    assert sorted(p["key"] for p in r.json()) == ["ABE", "ALH", "MEU"]


@pytest.mark.django_db
def test_acesso_direto_por_url_tambem_e_barrado(cenario):
    # O board sumir do menu e continuar acessível por URL é pior que não ter
    # permissão nenhuma — parece protegido.
    r = _cli(cenario["dev"]).get(
        reverse("project-detail", args=[str(cenario["alheio"].id)])
    )
    assert r.status_code in (403, 404)


@pytest.mark.django_db
def test_cards_do_projeto_alheio_nao_abrem(cenario):
    CardModel.objects.create(
        project=cenario["alheio"], number=1, title="sigiloso", status="todo"
    )

    r = _cli(cenario["dev"]).get(
        reverse("card-list-create", args=[str(cenario["alheio"].id)])
    )
    assert r.status_code in (403, 404)


@pytest.mark.django_db
def test_papel_atribuido_abre_o_acesso(cenario):
    papel = ProjectRoleModel.objects.create(
        project=cenario["alheio"], name="Leitor", slug="viewer"
    )
    ProjectRoleMemberModel.objects.create(role=papel, user_id=cenario["dev"].id)

    r = _cli(cenario["dev"]).get(reverse("project-list-create"), {"workspace_id": str(cenario["ws"].id)})
    assert "ALH" in [p["key"] for p in r.json()]


@pytest.mark.django_db
def test_squad_dona_do_board_da_acesso_a_todo_o_time(cenario):
    """O caminho normal: o board é da squad, e o time inteiro enxerga.

    Sem isto, dar acesso significaria repetir a mesma lista de pessoas em cada
    projeto do time — em dezenas de boards, ninguém faria.
    """
    from contexts.estimation.infrastructure.django.models import (
        SquadMemberModel,
        SquadModel,
    )

    squad = SquadModel.objects.create(workspace=cenario["ws"], name="Squad Alfa")
    SquadMemberModel.objects.create(squad=squad, user=cenario["dev"])
    cenario["alheio"].squad = squad
    cenario["alheio"].save(update_fields=["squad"])

    r = _cli(cenario["dev"]).get(
        reverse("project-list-create"), {"workspace_id": str(cenario["ws"].id)}
    )
    assert "ALH" in [p["key"] for p in r.json()]


@pytest.mark.django_db
def test_criar_board_ja_declarando_squad_e_convidados(cenario):
    from contexts.estimation.infrastructure.django.models import (
        SquadMemberModel,
        SquadModel,
    )

    squad = SquadModel.objects.create(workspace=cenario["ws"], name="Squad Beta")
    outro = UserModel.objects.create_user(
        email="convidado@t4e.com", password="x", full_name="Convidado", is_active=True
    )
    MembershipModel.objects.create(workspace=cenario["ws"], user=outro, role="member")
    SquadMemberModel.objects.create(squad=squad, user=cenario["dev"])

    r = _cli(cenario["dono"]).post(
        reverse("project-list-create"),
        {
            "workspace_id": str(cenario["ws"].id),
            "name": "Novo Board",
            "key": "NVB",
            "squad_id": str(squad.id),
            "member_ids": [str(outro.id)],
        },
        format="json",
    )
    assert r.status_code in (200, 201)

    # Time da squad e convidado avulso enxergam; quem não é nem um nem outro, não.
    for user in (cenario["dev"], outro):
        lista = _cli(user).get(
            reverse("project-list-create"), {"workspace_id": str(cenario["ws"].id)}
        ).json()
        assert "NVB" in [p["key"] for p in lista]

    de_fora = UserModel.objects.create_user(
        email="fora@t4e.com", password="x", full_name="De Fora", is_active=True
    )
    MembershipModel.objects.create(workspace=cenario["ws"], user=de_fora, role="member")
    lista = _cli(de_fora).get(
        reverse("project-list-create"), {"workspace_id": str(cenario["ws"].id)}
    ).json()
    assert "NVB" not in [p["key"] for p in lista]
