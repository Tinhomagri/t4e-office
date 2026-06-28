"""Testes do fluxo OAuth (authorization url, callback, credenciais)."""
from datetime import UTC, datetime, timedelta

import pytest

from contexts.google.application.use_cases.get_authorization_url import (
    GetAuthorizationUrl,
)
from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
    GoogleNotConnectedError,
)
from contexts.google.application.use_cases.handle_oauth_callback import (
    HandleOAuthCallback,
)
from contexts.google.domain.ports.oauth_provider import OAuthTokens
from shared.domain.errors import ValidationError

from .fakes import (
    FakeConnectionRepository,
    FakeOAuthProvider,
    FakeStateRepository,
    make_connection,
)


def test_authorization_url_registra_state():
    states = FakeStateRepository()
    url = GetAuthorizationUrl(
        oauth_provider=FakeOAuthProvider(), state_repository=states
    ).execute(user_id="u1")
    assert "state=" in url
    # state foi persistido p/ validação no callback
    assert len(states._states) == 1


def test_callback_salva_conexao_com_state_valido():
    states = FakeStateRepository()
    states.create(state="s1", user_id="u1")
    conns = FakeConnectionRepository()
    HandleOAuthCallback(
        oauth_provider=FakeOAuthProvider(),
        connection_repository=conns,
        state_repository=states,
    ).execute(code="code-123", state="s1")
    conn = conns.get_by_user(user_id="u1")
    assert conn is not None
    assert conn.google_email == "user@gmail.com"
    assert conn.refresh_token == "ref-new"


def test_callback_rejeita_state_invalido():
    with pytest.raises(ValidationError):
        HandleOAuthCallback(
            oauth_provider=FakeOAuthProvider(),
            connection_repository=FakeConnectionRepository(),
            state_repository=FakeStateRepository(),
        ).execute(code="code-123", state="inexistente")


def test_callback_rejeita_code_ausente():
    states = FakeStateRepository()
    states.create(state="s1", user_id="u1")
    with pytest.raises(ValidationError):
        HandleOAuthCallback(
            oauth_provider=FakeOAuthProvider(),
            connection_repository=FakeConnectionRepository(),
            state_repository=states,
        ).execute(code="", state="s1")


def test_callback_exige_refresh_token():
    states = FakeStateRepository()
    states.create(state="s1", user_id="u1")
    provider = FakeOAuthProvider(
        exchange_tokens=OAuthTokens(
            access_token="acc",
            refresh_token=None,
            expiry=datetime(2999, 1, 1, tzinfo=UTC),
            email="user@gmail.com",
        )
    )
    with pytest.raises(ValidationError):
        HandleOAuthCallback(
            oauth_provider=provider,
            connection_repository=FakeConnectionRepository(),
            state_repository=states,
        ).execute(code="c", state="s1")


def test_credenciais_retorna_token_valido_sem_refresh():
    conns = FakeConnectionRepository()
    future = datetime.now(UTC) + timedelta(hours=1)
    conns.upsert(connection=make_connection(expiry=future))
    token = GetValidCredentials(
        oauth_provider=FakeOAuthProvider(),
        connection_repository=conns,
    ).execute(user_id="u1")
    assert token == "acc-1"


def test_credenciais_renova_quando_expirado():
    conns = FakeConnectionRepository()
    past = datetime.now(UTC) - timedelta(hours=1)
    conns.upsert(connection=make_connection(expiry=past))
    token = GetValidCredentials(
        oauth_provider=FakeOAuthProvider(),
        connection_repository=conns,
    ).execute(user_id="u1")
    assert token == "acc-refreshed"
    # refresh_token original preservado (Google não devolveu novo)
    assert conns.get_by_user(user_id="u1").refresh_token == "ref-1"


def test_credenciais_marca_revogado_quando_refresh_falha():
    conns = FakeConnectionRepository()
    past = datetime.now(UTC) - timedelta(hours=1)
    conns.upsert(connection=make_connection(expiry=past))
    with pytest.raises(GoogleNotConnectedError):
        GetValidCredentials(
            oauth_provider=FakeOAuthProvider(revoked=True),
            connection_repository=conns,
        ).execute(user_id="u1")
    assert conns.get_by_user(user_id="u1").status.value == "revoked"


def test_credenciais_sem_conexao_erro():
    with pytest.raises(GoogleNotConnectedError):
        GetValidCredentials(
            oauth_provider=FakeOAuthProvider(),
            connection_repository=FakeConnectionRepository(),
        ).execute(user_id="u1")
