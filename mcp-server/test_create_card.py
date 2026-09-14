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
