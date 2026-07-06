"""Cifragem simétrica do token OAuth do GitHub (Fernet)."""
from cryptography.fernet import Fernet
from django.conf import settings


def _fernet() -> Fernet:
    key = (
        getattr(settings, "GITHUB_TOKEN_ENC_KEY", "")
        or getattr(settings, "GOOGLE_TOKEN_ENC_KEY", "")
        or getattr(settings, "AI_CONFIG_ENC_KEY", "")
    )
    if not key:
        raise RuntimeError(
            "GITHUB_TOKEN_ENC_KEY (ou GOOGLE_TOKEN_ENC_KEY) não configurada."
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    if not token:
        return ""
    return _fernet().decrypt(token.encode()).decode()
