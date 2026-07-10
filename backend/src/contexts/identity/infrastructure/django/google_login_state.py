"""State OAuth stateless p/ login/cadastro com Google.

Sem usuário autenticado ainda p/ vincular o state (diferente do fluxo de
account-linking em `contexts.google`), então usamos assinatura HMAC com TTL
em vez de uma linha no banco.
"""
import secrets

from django.core import signing

_SALT = "identity.google-login-state"
_MAX_AGE_SECONDS = 600  # 10 minutos


def issue_state() -> str:
    nonce = secrets.token_urlsafe(16)
    return signing.dumps(nonce, salt=_SALT)


def verify_state(state: str) -> bool:
    try:
        signing.loads(state, salt=_SALT, max_age=_MAX_AGE_SECONDS)
    except signing.BadSignature:
        return False
    return True
