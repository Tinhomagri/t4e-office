"""Cifragem do api_access_token do Chatwoot (Fernet)."""
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _fernet() -> Fernet:
    key = settings.CHATWOOT_TOKEN_ENC_KEY
    if not key:
        raise RuntimeError(
            "CHATWOOT_TOKEN_ENC_KEY (ou GOOGLE_TOKEN_ENC_KEY) não configurada — "
            "necessária p/ cifrar o token do Chatwoot. Gere com: "
            'python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(plaintext: str) -> str:
    """Cifra o token e devolve string base64 segura p/ armazenar."""
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """Decifra um token cifrado por `encrypt`.

    Devolve string vazia se a chave girou e o valor antigo não abre mais — quem
    chama trata isso como "precisa reconectar", não como crash.
    """
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return ""
