"""Sessão de Planning Poker é da SQUAD, não de um projeto.

O time se reúne uma vez e estima o que precisar — antes, cada projeto exigia
abrir uma sessão separada, e a estimativa de quinta virava três salas.
"""
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from contexts.estimation.infrastructure.django.models import (
    PokerSessionModel,
    SquadMemberModel,
    SquadModel,
)
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import CardModel, ProjectModel


@pytest.fixture
def cenario(db):
    dono = UserModel.objects.create_user(
        email="dono@t4e.com", password="x", full_name="Ana Dono", is_active=True
    )
    dev = UserModel.objects.create_user(
        email="dev@t4e.com", password="x", full_name="Bob Dev", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="T4E", slug="t4e", owner=dono)
    for u in (dono, dev):
        MembershipModel.objects.create(workspace=ws, user=u, role="member")

    alfa = ProjectModel.objects.create(workspace=ws, name="Alfa", key="ALF")
    beta = ProjectModel.objects.create(workspace=ws, name="Beta", key="BET")
    # Um card sem pontos em cada projeto e um já estimado.
    CardModel.objects.create(project=alfa, number=1, title="login", status="todo")
    CardModel.objects.create(project=beta, number=1, title="relatório", status="todo")
    CardModel.objects.create(project=beta, number=2, title="já estimado", status="todo", points=5)
    return {"ws": ws, "dono": dono, "dev": dev, "alfa": alfa, "beta": beta}


def _cli(user) -> APIClient:
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_cria_squad_com_membros(cenario):
    r = _cli(cenario["dono"]).post(
        reverse("squad-list-create", args=[str(cenario["ws"].id)]),
        {"name": "Squad Alfa", "member_ids": [str(cenario["dev"].id)]},
        format="json",
    )
    assert r.status_code == 201
    assert r.json()["name"] == "Squad Alfa"
    assert [m["name"] for m in r.json()["members"]] == ["Bob Dev"]


@pytest.mark.django_db
def test_nome_de_squad_nao_repete_no_workspace(cenario):
    cli = _cli(cenario["dono"])
    url = reverse("squad-list-create", args=[str(cenario["ws"].id)])
    cli.post(url, {"name": "Squad Alfa"}, format="json")
    r = cli.post(url, {"name": "squad alfa"}, format="json")
    assert r.status_code == 400


@pytest.mark.django_db
def test_sessao_pode_nascer_da_squad_sem_projeto(cenario):
    squad = SquadModel.objects.create(workspace=cenario["ws"], name="Squad Alfa")

    r = _cli(cenario["dono"]).post(
        reverse("poker-list-create", args=[str(cenario["ws"].id)]),
        {"squad_id": str(squad.id), "name": "Estimativa de quinta"},
        format="json",
    )
    assert r.status_code == 201
    assert r.json()["squad_id"] == str(squad.id)
    assert r.json()["project_id"] is None


@pytest.mark.django_db
def test_sessao_sem_squad_e_sem_projeto_e_recusada(cenario):
    r = _cli(cenario["dono"]).post(
        reverse("poker-list-create", args=[str(cenario["ws"].id)]),
        {"name": "solta"},
        format="json",
    )
    assert r.status_code == 400


@pytest.mark.django_db
def test_squad_de_outro_workspace_e_recusada(cenario):
    outro_dono = UserModel.objects.create_user(
        email="outro@t4e.com", password="x", full_name="Outro", is_active=True
    )
    outro_ws = WorkspaceModel.objects.create(name="Outro", slug="outro", owner=outro_dono)
    intrusa = SquadModel.objects.create(workspace=outro_ws, name="De fora")

    r = _cli(cenario["dono"]).post(
        reverse("poker-list-create", args=[str(cenario["ws"].id)]),
        {"squad_id": str(intrusa.id)},
        format="json",
    )
    assert r.status_code == 400


@pytest.mark.django_db
def test_fila_traz_cards_de_todos_os_projetos_sem_pontos(cenario):
    squad = SquadModel.objects.create(workspace=cenario["ws"], name="Squad Alfa")
    sessao = PokerSessionModel.objects.create(
        workspace=cenario["ws"], squad=squad, created_by=cenario["dono"], name="s"
    )

    r = _cli(cenario["dono"]).get(reverse("poker-cards", args=[str(sessao.id)]))
    refs = [c["ref"] for c in r.json()]

    # Os dois projetos aparecem na mesma sessão — é o ponto da mudança.
    assert "ALF-1" in refs
    assert "BET-1" in refs
    # Card já estimado fica fora: numa sessão de estimativa ninguém repontua.
    assert "BET-2" not in refs


@pytest.mark.django_db
def test_fila_filtra_por_busca_e_por_projeto(cenario):
    squad = SquadModel.objects.create(workspace=cenario["ws"], name="Squad Alfa")
    sessao = PokerSessionModel.objects.create(
        workspace=cenario["ws"], squad=squad, created_by=cenario["dono"], name="s"
    )
    cli = _cli(cenario["dono"])
    url = reverse("poker-cards", args=[str(sessao.id)])

    # Com 2400 cards no workspace, a busca é o caminho principal.
    r = cli.get(url, {"q": "relat"})
    assert [c["ref"] for c in r.json()] == ["BET-1"]

    r = cli.get(url, {"project": str(cenario["alfa"].id)})
    assert [c["ref"] for c in r.json()] == ["ALF-1"]


@pytest.mark.django_db
def test_fila_busca_tambem_por_chave_do_projeto(cenario):
    """Buscar "alf" tem que trazer TODOS os cards do projeto ALF, não só os
    que têm essa palavra no título — com dezenas de projetos, é assim que o
    host encontra o board certo."""
    squad = SquadModel.objects.create(workspace=cenario["ws"], name="Squad Alfa")
    sessao = PokerSessionModel.objects.create(
        workspace=cenario["ws"], squad=squad, created_by=cenario["dono"], name="s"
    )
    r = _cli(cenario["dono"]).get(reverse("poker-cards", args=[str(sessao.id)]), {"q": "alf"})
    assert [c["ref"] for c in r.json()] == ["ALF-1"]


@pytest.mark.django_db
def test_apagar_squad_preserva_o_historico_de_sessoes(cenario):
    squad = SquadModel.objects.create(workspace=cenario["ws"], name="Squad Alfa")
    SquadMemberModel.objects.create(squad=squad, user=cenario["dev"])
    sessao = PokerSessionModel.objects.create(
        workspace=cenario["ws"], squad=squad, created_by=cenario["dono"], name="antiga"
    )

    _cli(cenario["dono"]).delete(reverse("squad-detail", args=[str(squad.id)]))

    sessao.refresh_from_db()
    # A estimativa aconteceu: apagar o time não pode apagar o registro dela.
    assert sessao.squad_id is None
    assert PokerSessionModel.objects.filter(id=sessao.id).exists()


@pytest.mark.django_db
def test_editar_membros_substitui_a_lista(cenario):
    squad = SquadModel.objects.create(workspace=cenario["ws"], name="Squad Alfa")
    SquadMemberModel.objects.create(squad=squad, user=cenario["dono"])

    r = _cli(cenario["dono"]).patch(
        reverse("squad-detail", args=[str(squad.id)]),
        {"member_ids": [str(cenario["dev"].id)]},
        format="json",
    )
    assert [m["name"] for m in r.json()["members"]] == ["Bob Dev"]
