"""create_card não deve forçar status="todo" quando o chamador não especifica —
isso ignorava o fallback is_default do backend e órfão cards em projetos com
colunas customizadas (bug achado investigando sumiço de cards em produção)."""
from unittest.mock import patch

import server


def test_status_omitido_nao_manda_status_no_payload():
    with patch("server._request", return_value={"id": "1"}) as mock_request:
        server.create_card(project_id="p1", title="Card", ctx=None)

    _, kwargs = mock_request.call_args
    assert "status" not in kwargs["json"]


def test_status_explicito_e_incluido_no_payload():
    with patch("server._request", return_value={"id": "1"}) as mock_request:
        server.create_card(project_id="p1", title="Card", status="concluído", ctx=None)

    _, kwargs = mock_request.call_args
    assert kwargs["json"]["status"] == "concluído"


def test_update_card_manda_so_os_campos_informados():
    with patch("server._request", return_value={"id": "c1"}) as mock_request:
        server.update_card(card_id="c1", title="Novo", ctx=None)

    args, kwargs = mock_request.call_args
    assert args[1:] == ("PATCH", "/api/cards/c1/")
    assert kwargs["json"] == {"title": "Novo"}


def test_update_card_sem_campo_nenhum_falha_antes_de_chamar_a_api():
    with patch("server._request") as mock_request:
        try:
            server.update_card(card_id="c1", ctx=None)
        except ValueError:
            pass
        else:
            raise AssertionError("deveria exigir ao menos um campo")

    mock_request.assert_not_called()


def test_delete_card_chama_delete_e_confirma():
    with patch("server._request", return_value={}) as mock_request:
        result = server.delete_card(card_id="c1", ctx=None)

    args, _ = mock_request.call_args
    assert args[1:] == ("DELETE", "/api/cards/c1/")
    assert result == {"deleted": "c1"}
