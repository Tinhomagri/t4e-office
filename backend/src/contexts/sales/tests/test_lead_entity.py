"""Testes da entidade Lead: SLA, esteira de qualificação, invariantes."""
from datetime import UTC, datetime, timedelta

import pytest

from contexts.sales.domain.entities.lead import FIRST_CONTACT_SLA_HOURS, Lead, LeadStatus
from shared.domain.errors import ValidationError


def make_lead(**overrides) -> Lead:
    defaults = dict(id=None, workspace_id="ws1", name="Ana Beatriz")
    defaults.update(overrides)
    return Lead(**defaults)


class TestInvariantes:
    def test_nome_obrigatorio(self):
        with pytest.raises(ValidationError):
            make_lead(name="   ")

    def test_score_fora_do_intervalo_rejeita(self):
        with pytest.raises(ValidationError):
            make_lead(score=101)
        with pytest.raises(ValidationError):
            make_lead(score=-1)

    def test_desqualificado_sem_motivo_rejeita(self):
        with pytest.raises(ValidationError):
            make_lead(status=LeadStatus.DISQUALIFIED)

    def test_status_padrao_e_novo(self):
        assert make_lead().status == LeadStatus.NEW


class TestSLA:
    def test_prazo_e_calculado_automaticamente(self):
        lead = make_lead()
        assert lead.first_contact_due_at is not None

    def test_prazo_respeita_a_constante_de_horas(self):
        before = datetime.now(UTC)
        lead = make_lead()
        expected_min = before + timedelta(hours=FIRST_CONTACT_SLA_HOURS)
        # tolerância de alguns segundos entre o `before` e a criação real
        assert abs((lead.first_contact_due_at - expected_min).total_seconds()) < 5

    def test_prazo_explicito_nao_e_recalculado(self):
        fixed = datetime(2020, 1, 1, tzinfo=UTC)
        lead = make_lead(first_contact_due_at=fixed)
        assert lead.first_contact_due_at == fixed

    def test_lead_novo_dentro_do_prazo_nao_esta_vencido(self):
        lead = make_lead(first_contact_due_at=datetime.now(UTC) + timedelta(hours=1))
        assert lead.is_overdue is False

    def test_lead_novo_fora_do_prazo_esta_vencido(self):
        lead = make_lead(first_contact_due_at=datetime.now(UTC) - timedelta(hours=1))
        assert lead.is_overdue is True

    def test_lead_contatado_nunca_fica_vencido(self):
        # O relógio do SLA para no primeiro contato — não fica "vencido para
        # sempre" só porque ninguém fechou o card.
        lead = make_lead(
            first_contact_due_at=datetime.now(UTC) - timedelta(hours=1),
            contacted_at=datetime.now(UTC),
        )
        assert lead.is_overdue is False

    def test_lead_desqualificado_nao_conta_como_vencido(self):
        lead = make_lead(
            first_contact_due_at=datetime.now(UTC) - timedelta(hours=1),
            status=LeadStatus.DISQUALIFIED,
            disqualify_reason="Sem orçamento",
        )
        assert lead.is_overdue is False

    def test_mark_contacted_encerra_o_sla_e_promove_de_novo_para_contatado(self):
        lead = make_lead()
        lead.mark_contacted()
        assert lead.contacted_at is not None
        assert lead.status == LeadStatus.CONTACTED

    def test_mark_contacted_nao_regride_status_mais_avancado(self):
        lead = make_lead(status=LeadStatus.QUALIFIED, score=80)
        lead.mark_contacted()
        assert lead.status == LeadStatus.QUALIFIED


class TestQualificacao:
    def test_qualify_atribui_score_e_muda_status(self):
        lead = make_lead()
        lead.qualify(score=72)
        assert lead.score == 72
        assert lead.status == LeadStatus.QUALIFIED

    def test_qualify_score_invalido_rejeita(self):
        lead = make_lead()
        with pytest.raises(ValidationError):
            lead.qualify(score=150)

    def test_qualify_apos_convertido_rejeita(self):
        lead = make_lead()
        lead.mark_converted(deal_id="d1", customer_id="c1")
        with pytest.raises(ValidationError):
            lead.qualify(score=50)

    def test_disqualify_exige_motivo(self):
        lead = make_lead()
        with pytest.raises(ValidationError):
            lead.disqualify(reason="   ")

    def test_disqualify_move_status_e_grava_motivo(self):
        lead = make_lead()
        lead.disqualify(reason="Não é o público-alvo")
        assert lead.status == LeadStatus.DISQUALIFIED
        assert lead.disqualify_reason == "Não é o público-alvo"

    def test_requalificar_depois_de_desqualificado_limpa_o_motivo(self):
        # Reabrir um lead descartado não pode deixar o motivo antigo pendurado.
        lead = make_lead()
        lead.disqualify(reason="Sem verba agora")
        lead.qualify(score=60)
        assert lead.disqualify_reason == ""


class TestConversao:
    def test_lead_novo_e_convertivel(self):
        make_lead().assert_convertible()  # não levanta

    def test_lead_convertido_nao_pode_reconverter(self):
        lead = make_lead()
        lead.mark_converted(deal_id="d1", customer_id="c1")
        with pytest.raises(ValidationError):
            lead.assert_convertible()

    def test_lead_desqualificado_nao_pode_converter(self):
        lead = make_lead()
        lead.disqualify(reason="Concorrente fechou antes")
        with pytest.raises(ValidationError):
            lead.assert_convertible()

    def test_mark_converted_grava_referencias_e_status(self):
        lead = make_lead()
        lead.mark_converted(deal_id="deal-9", customer_id="cust-9")
        assert lead.status == LeadStatus.CONVERTED
        assert lead.converted_deal_id == "deal-9"
        assert lead.converted_customer_id == "cust-9"
        assert lead.converted_at is not None

    def test_convertido_deixa_de_ser_open(self):
        lead = make_lead()
        lead.mark_converted(deal_id="d1", customer_id="c1")
        assert lead.is_open is False

    def test_desqualificado_deixa_de_ser_open(self):
        lead = make_lead()
        lead.disqualify(reason="Fora do perfil")
        assert lead.is_open is False

    def test_novo_e_qualificando_sao_open(self):
        assert make_lead().is_open is True
        assert make_lead(status=LeadStatus.QUALIFYING).is_open is True
