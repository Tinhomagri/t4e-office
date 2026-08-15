"""Testes do conversor ADF → texto simples."""
from contexts.jira.infrastructure.adf import adf_to_text


def test_none_vira_string_vazia():
    assert adf_to_text(None) == ""


def test_paragrafo_simples():
    doc = {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "Olá mundo"}]}
        ],
    }
    assert adf_to_text(doc) == "Olá mundo"


def test_dois_paragrafos_viram_linhas_separadas_por_linha_em_branco():
    doc = {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "Primeiro"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": "Segundo"}]},
        ],
    }
    assert adf_to_text(doc) == "Primeiro\n\nSegundo"


def test_hard_break_vira_quebra_de_linha():
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "linha 1"},
                    {"type": "hardBreak"},
                    {"type": "text", "text": "linha 2"},
                ],
            }
        ],
    }
    assert adf_to_text(doc) == "linha 1\nlinha 2"


def test_bullet_list_vira_itens_com_traco():
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "bulletList",
                "content": [
                    {
                        "type": "listItem",
                        "content": [{"type": "paragraph", "content": [{"type": "text", "text": "item a"}]}],
                    },
                    {
                        "type": "listItem",
                        "content": [{"type": "paragraph", "content": [{"type": "text", "text": "item b"}]}],
                    },
                ],
            }
        ],
    }
    assert adf_to_text(doc) == "- item a\n- item b"


def test_code_block_fica_entre_crases():
    doc = {
        "type": "doc",
        "content": [
            {"type": "codeBlock", "content": [{"type": "text", "text": "print(1)"}]}
        ],
    }
    assert adf_to_text(doc) == "```\nprint(1)\n```"


def test_no_desconhecido_nao_quebra():
    doc = {"type": "doc", "content": [{"type": "mediaSingle", "content": [{"type": "media"}]}]}
    assert adf_to_text(doc) == ""


def test_mention_vira_arroba_nome():
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "mention", "attrs": {"id": "abc", "text": "@Ana"}}],
            }
        ],
    }
    assert adf_to_text(doc) == "@Ana"
