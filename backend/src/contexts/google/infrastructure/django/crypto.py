"""Cifragem simétrica de tokens (Fernet)."""
from cryptography.fernet import Fernet
from django.conf import settings


def _fernet() -> Fernet:
    key = settings.GOOGLE_TOKEN_ENC_KEY
    if not key:
        raise RuntimeError(
            "GOOGLE_TOKEN_ENC_KEY não configurada — necessária p/ cifrar tokens Google."
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(plaintext: str) -> str:
    """Cifra um texto e retorna string base64 segura p/ armazenar."""
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """Decifra um texto previamente cifrado por `encrypt`."""
    if not token:
        return ""
    return _fernet().decrypt(token.encode()).decode()
