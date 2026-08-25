"""Testes da resolução cidade/UF — porte de geografia.ts."""
from contexts.traffic.infrastructure import geography


def test_state_for_uses_state_column_when_valid_uf():
    assert geography.state_for("qualquer coisa", "sp") == "SP"


def test_state_for_uses_known_city_dictionary():
    assert geography.state_for("São Paulo", "") == "SP"
    assert geography.state_for("Rio de Janeiro", None) == "RJ"


def test_state_for_uses_uf_suffix_glued_to_city_name():
    assert geography.state_for("guaratinguetasp", "") == "SP"
    assert geography.state_for("betimmg", "") == "MG"


def test_state_for_returns_none_for_unknown_city_with_non_uf_suffix():
    # "goias" (5 letras) não está no dicionário de cidades, e seu sufixo
    # "AS" não é uma UF válida — cai no None, não em "GO" (Goiás real usa
    # sigla "GO", que exigiria a cidade estar cadastrada ou vir na coluna
    # de estado).
    assert geography.state_for("goias", "") is None


def test_state_for_matches_mato_grosso_and_tocantins_by_substring():
    assert geography.state_for("cuiabamatogrosso", "") in ("MT", "MT")


def test_state_for_returns_none_when_unresolvable():
    assert geography.state_for("", "") is None
    assert geography.state_for(None, None) is None
