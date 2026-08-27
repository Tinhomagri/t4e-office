"""Audiência da sala de reunião: quem enxerga, quem entra, quem fecha.

Mesma filosofia do board (`can_browse`): admin/owner sempre veem, sala aberta
ao workspace sempre aparece, squad dona basta, senão só quem foi adicionado
explicitamente — e o criador nunca fica de fora da própria sala.
"""
import pytest
from rest_framework.test import APIClient

from contexts.estimation.infrastructure.django.models import SquadMemberModel, SquadModel
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.meetings.infrastructure.django.models import MeetingRoomModel
from contexts.meetings.interface.api.views import can_see_room


@pytest.fixture
def cenario(db):
    dono = UserModel.objects.create_user(
        email="dono@t4e.com", password="x", full_name="Dono", is_active=True
    )
    admin = UserModel.objects.create_user(
        email="admin@t4e.com", password="x", full_name="Admin", is_active=True
    )
    membro = UserModel.objects.create_user(
        email="membro@t4e.com", password="x", full_name="Membro", is_active=True
    )
    de_fora = UserModel.objects.create_user(
        email="fora@t4e.com", password="x", full_name="De Fora", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="T4E", slug="t4e-audiencia", owner=dono)
    MembershipModel.objects.create(workspace=ws, user=dono, role="owner")
    MembershipModel.objects.create(workspace=ws, user=admin, role="admin")
    MembershipModel.objects.create(workspace=ws, user=membro, role="member")
    MembershipModel.objects.create(workspace=ws, user=de_fora, role="member")

    squad = SquadModel.objects.create(workspace=ws, name="Squad Alfa")
    SquadMemberModel.objects.create(squad=squad, user=membro)

    def _cli(user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    return {
        "ws": ws,
        "dono": dono,
        "admin": admin,
        "membro": membro,
        "de_fora": de_fora,
        "squad": squad,
        "cli": _cli,
    }


# ── can_see_room (unitário) ──────────────────────────────────────────────────


def test_admin_do_workspace_sempre_ve(cenario):
    sala = MeetingRoomModel.objects.create(
        workspace=cenario["ws"], slug="s1", name="Restrita", created_by=cenario["dono"].id
    )
    assert can_see_room(sala, str(cenario["admin"].id)) is True


def test_membro_fora_da_squad_e_da_audiencia_e_negado(cenario):
    sala = MeetingRoomModel.objects.create(
        workspace=cenario["ws"], slug="s2", name="Restrita", created_by=cenario["dono"].id
    )
    assert can_see_room(sala, str(cenario["de_fora"].id)) is False


def test_visibilidade_workspace_libera_qualquer_membro(cenario):
    sala = MeetingRoomModel.objects.create(
        workspace=cenario["ws"],
        slug="s3",
        name="Aberta",
        created_by=cenario["dono"].id,
        visibility="workspace",
    )
    assert can_see_room(sala, str(cenario["de_fora"].id)) is True


def test_membro_da_squad_dona_da_sala_ve(cenario):
    sala = MeetingRoomModel.objects.create(
        workspace=cenario["ws"],
        slug="s4",
        name="Da squad",
        created_by=cenario["dono"].id,
        squad=cenario["squad"],
    )
    assert can_see_room(sala, str(cenario["membro"].id)) is True
    assert can_see_room(sala, str(cenario["de_fora"].id)) is False


def test_audiencia_explicita_libera(cenario):
    sala = MeetingRoomModel.objects.create(
        workspace=cenario["ws"],
        slug="s5",
        name="Convidados",
        created_by=cenario["dono"].id,
        audience_user_ids=[str(cenario["de_fora"].id)],
    )
    assert can_see_room(sala, str(cenario["de_fora"].id)) is True


def test_criador_sempre_ve_a_propria_sala_mesmo_removido_da_audiencia(cenario):
    sala = MeetingRoomModel.objects.create(
        workspace=cenario["ws"],
        slug="s6",
        name="Minha sala",
        created_by=cenario["de_fora"].id,
        audience_user_ids=[],
    )
    assert can_see_room(sala, str(cenario["de_fora"].id)) is True


def test_office_e_poker_nao_sao_gateadas(cenario):
    sala = MeetingRoomModel.objects.create(
        workspace=cenario["ws"], slug="s7", name="Andar 1", created_by=cenario["dono"].id, kind="office"
    )
    assert can_see_room(sala, str(cenario["de_fora"].id)) is True


# ── RoomListCreateView.get — integração ──────────────────────────────────────


def test_listagem_so_mostra_sala_restrita_pra_audiencia(cenario):
    MeetingRoomModel.objects.create(
        workspace=cenario["ws"],
        slug="lst-1",
        name="Restrita",
        created_by=cenario["dono"].id,
        squad=cenario["squad"],
    )
    url = f"/api/meetings/rooms/?workspace_id={cenario['ws'].id}"

    resp_membro = cenario["cli"](cenario["membro"]).get(url)
    assert resp_membro.status_code == 200
    assert len(resp_membro.data) == 1

    resp_fora = cenario["cli"](cenario["de_fora"]).get(url)
    assert resp_fora.status_code == 200
    assert len(resp_fora.data) == 0


# ── RoomJoinView — integração ─────────────────────────────────────────────────


def test_join_nega_quem_nao_esta_na_audiencia_mesmo_com_o_uuid(cenario):
    sala = MeetingRoomModel.objects.create(
        workspace=cenario["ws"],
        slug="join-1",
        name="Restrita",
        created_by=cenario["dono"].id,
        squad=cenario["squad"],
    )
    resp = cenario["cli"](cenario["de_fora"]).post(f"/api/meetings/rooms/{sala.id}/join/")
    assert resp.status_code == 403


def test_join_libera_membro_da_squad(cenario):
    sala = MeetingRoomModel.objects.create(
        workspace=cenario["ws"],
        slug="join-2",
        name="Restrita",
        created_by=cenario["dono"].id,
        squad=cenario["squad"],
    )
    resp = cenario["cli"](cenario["membro"]).post(f"/api/meetings/rooms/{sala.id}/join/")
    assert resp.status_code == 200


# ── RoomCloseView — integração ────────────────────────────────────────────────


def test_close_nega_sala_permanente_mesmo_para_admin(cenario):
    sala = MeetingRoomModel.objects.create(
        workspace=cenario["ws"],
        slug="close-1",
        name="Squad Alfa",
        created_by=cenario["dono"].id,
        squad=cenario["squad"],
        is_permanent=True,
    )
    resp = cenario["cli"](cenario["admin"]).post(f"/api/meetings/rooms/{sala.id}/close/")
    assert resp.status_code == 403
    sala.refresh_from_db()
    assert sala.closed_at is None


def test_close_funciona_em_sala_comum(cenario):
    sala = MeetingRoomModel.objects.create(
        workspace=cenario["ws"], slug="close-2", name="Comum", created_by=cenario["dono"].id
    )
    resp = cenario["cli"](cenario["dono"]).post(f"/api/meetings/rooms/{sala.id}/close/")
    assert resp.status_code == 200
    sala.refresh_from_db()
    assert sala.closed_at is not None
