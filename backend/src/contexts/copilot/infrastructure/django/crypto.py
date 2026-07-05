"""Cifragem simétrica das API keys de IA por workspace (Fernet)."""
from cryptography.fernet import Fernet
from django.conf import settings


def _fernet() -> Fernet:
    key = settings.AI_CONFIG_ENC_KEY
    if not key:
        raise RuntimeError(
            "AI_CONFIG_ENC_KEY (ou GOOGLE_TOKEN_ENC_KEY) não configurada — "
            "necessária p/ cifrar as chaves de IA por workspace."
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(plaintext: str) -> str:
    """Cifra a chave e retorna string base64 segura p/ armazenar."""
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """Decifra uma chave previamente cifrada por `encrypt`."""
    if not token:
        return ""
    return _fernet().decrypt(token.encode()).decode()
