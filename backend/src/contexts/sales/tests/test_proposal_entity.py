"""Testes da entidade Proposta — o dinheiro e o ciclo de vida.

Estes são os testes que importam do sub-projeto: se o total divergir do que o
cliente vê no PDF, a empresa cobra errado.
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest

from contexts.sales.domain.entities.proposal import Proposal, ProposalLineItem
from shared.domain.errors import ConflictError, ValidationError


def item(description="Serviço", quantity="1", unit_price="100", position=0):
    return ProposalLineItem(
        id=None,
        description=description,
        quantity=Decimal(quantity),
        unit_price=Decimal(unit_price),
        position=position,
    )


def proposal(**kw):
    defaults = {
        "id": None,
        "workspace_id": "w1",
        "deal_id": "d1",
        "title": "Proposta de implantação",
    }
    defaults.update(kw)
    return Proposal(**defaults)


# ── Item de linha ────────────────────────────────────────────────────────────
def test_subtotal_da_linha_e_quantidade_vezes_valor():
    assert item(quantity="3", unit_price="250.00").subtotal == Decimal("750.00")


def test_linha_aceita_quantidade_fracionada():
    # 7,5 horas a R$ 180 — caso real de consultoria.
    assert item(quantity="7.5", unit_price="180").subtotal == Decimal("1350.00")


def test_valor_unitario_fecha_em_centavos_na_entrada():
    """O preço unitário é dinheiro: arredonda ao entrar, não ao multiplicar.

    33,335 vira 33,34 e o subtotal deriva daí (100,02). Guardar o preço em
    precisão cheia faria o PDF exibir "R$ 33,34 × 3" e totalizar 100,01 — o
    cliente multiplica na mão, encontra 100,02, e a conta parece errada.
    """
    linha = item(quantity="3", unit_price="33.335")
    assert linha.unit_price == Decimal("33.34")
    assert linha.subtotal == Decimal("100.02")


def test_subtotal_da_linha_arredonda_com_half_up():
    # Quantidade fracionada: 1,5 × 10,01 = 15,015 → 15,02 (meio pra cima).
    assert item(quantity="1.5", unit_price="10.01").subtotal == Decimal("15.02")


def test_linha_exige_descricao():
    with pytest.raises(ValidationError):
        item(description="   ")


def test_linha_recusa_quantidade_zero_ou_negativa():
    for quantity in ("0", "-1"):
        with pytest.raises(ValidationError):
            item(quantity=quantity)


def test_linha_aceita_valor_unitario_zero():
    # Item de cortesia dentro do orçamento é legítimo.
    assert item(unit_price="0").subtotal == Decimal("0.00")


def test_linha_apara_espacos_da_descricao():
    assert item(description="  Consultoria  ").description == "Consultoria"


# ── Totais da proposta ───────────────────────────────────────────────────────
def test_subtotal_soma_as_linhas():
    p = proposal(items=[item(unit_price="100"), item(unit_price="250.50")])
    assert p.subtotal == Decimal("350.50")


def test_total_desconta_o_desconto():
    p = proposal(items=[item(unit_price="1000")], discount=Decimal("150"))
    assert p.subtotal == Decimal("1000.00")
    assert p.total == Decimal("850.00")


def test_proposta_sem_itens_soma_zero():
    p = proposal()
    assert p.subtotal == Decimal("0.00")
    assert p.total == Decimal("0.00")


def test_total_fecha_com_a_soma_visivel_das_linhas():
    """Cada linha é fechada em centavos ANTES de somar.

    Caso escolhido para o arredondamento importar de verdade: 1,5 × 10,01 dá
    15,015 por linha. Fechando por linha → 15,02 + 15,02 = 30,04, que é o que
    o cliente lê na coluna de subtotais. Somando em precisão cheia e
    arredondando só no fim daria 30,03 — um centavo a menos que a soma visível.
    """
    linhas = [
        item(quantity="1.5", unit_price="10.01"),  # 15,02
        item(quantity="1.5", unit_price="10.01"),  # 15,02
    ]
    p = proposal(items=linhas)
    soma_visivel = sum(linha.subtotal for linha in linhas)

    assert p.subtotal == soma_visivel == Decimal("30.04")
    # A alternativa descartada, explicitada para o teste falhar se alguém
    # trocar a ordem das operações depois.
    ingenuo = (Decimal("1.5") * Decimal("10.01") * 2).quantize(Decimal("0.01"))
    assert ingenuo == Decimal("30.03")
    assert p.subtotal != ingenuo


def test_desconto_maior_que_subtotal_e_recusado():
    with pytest.raises(ValidationError):
        proposal(items=[item(unit_price="100")], discount=Decimal("500"))


def test_desconto_negativo_e_recusado():
    with pytest.raises(ValidationError):
        proposal(discount=Decimal("-10"))


def test_desconto_igual_ao_subtotal_zera_o_total():
    p = proposal(items=[item(unit_price="100")], discount=Decimal("100"))
    assert p.total == Decimal("0.00")


def test_proposta_vazia_aceita_desconto_pre_lancado():
    # A proposta nasce sem itens; validar o desconto contra subtotal zero
    # impediria de preencher o cabeçalho antes das linhas.
    p = proposal(discount=Decimal("50"))
    assert p.discount == Decimal("50.00")


# ── Invariantes de cabeçalho ─────────────────────────────────────────────────
def test_proposta_exige_titulo():
    with pytest.raises(ValidationError):
        proposal(title="  ")


def test_moeda_nao_suportada_e_recusada():
    with pytest.raises(ValidationError):
        proposal(currency="JPY")


def test_moeda_e_normalizada_para_maiuscula():
    assert proposal(currency="brl").currency == "BRL"


def test_status_invalido_e_recusado():
    with pytest.raises(ValidationError):
        proposal(status="enviada-talvez")


# ── Validade ─────────────────────────────────────────────────────────────────
def test_proposta_sem_prazo_nunca_vence():
    assert proposal(status="sent").is_expired is False


def test_proposta_enviada_vence_apos_o_prazo():
    p = proposal(status="sent", valid_until=date.today() - timedelta(days=1))
    assert p.is_expired is True


def test_proposta_no_ultimo_dia_do_prazo_ainda_vale():
    p = proposal(status="sent", valid_until=date.today())
    assert p.is_expired is False


def test_proposta_aceita_nao_vence_mesmo_fora_do_prazo():
    """Aceite fora do prazo continua valendo — vencimento é derivado, não gravado."""
    p = proposal(status="accepted", valid_until=date.today() - timedelta(days=30))
    assert p.is_expired is False


# ── Ciclo de vida ────────────────────────────────────────────────────────────
def test_rascunho_e_enviada_sao_editaveis():
    assert proposal(status="draft").is_editable is True
    assert proposal(status="sent").is_editable is True


def test_decidida_vira_documento_historico():
    for status in ("accepted", "rejected"):
        p = proposal(status=status)
        assert p.is_editable is False
        with pytest.raises(ConflictError):
            p.assert_editable()


def test_nao_envia_proposta_sem_item():
    with pytest.raises(ValidationError):
        proposal(status="draft").assert_sendable()


def test_nao_reenvia_proposta_ja_decidida():
    p = proposal(status="accepted", items=[item()])
    with pytest.raises(ConflictError):
        p.assert_sendable()


def test_reenviar_proposta_ja_enviada_e_permitido():
    # Cliente perdeu o e-mail: reenviar é caso de uso real.
    proposal(status="sent", items=[item()]).assert_sendable()


def test_nao_decide_rascunho_nunca_enviado():
    with pytest.raises(ConflictError):
        proposal(status="draft", items=[item()]).assert_decidable()


def test_enviada_pode_ser_decidida():
    proposal(status="sent", items=[item()]).assert_decidable()


def test_nao_decide_duas_vezes():
    for status in ("accepted", "rejected"):
        with pytest.raises(ConflictError):
            proposal(status=status, items=[item()]).assert_decidable()
