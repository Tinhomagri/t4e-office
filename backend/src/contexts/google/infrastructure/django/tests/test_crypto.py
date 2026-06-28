"""Teste de round-trip da cifragem de tokens (Fernet)."""
from cryptography.fernet import Fernet

from contexts.google.infrastructure.django import crypto


def test_encrypt_decrypt_round_trip(settings):
    settings.GOOGLE_TOKEN_ENC_KEY = Fernet.generate_key().decode()
    secret = "1//refresh-token-secreto"
    cifrado = crypto.encrypt(secret)
    assert cifrado != secret  # não é texto plano
    assert crypto.decrypt(cifrado) == secret


def test_encrypt_vazio_retorna_vazio(settings):
    settings.GOOGLE_TOKEN_ENC_KEY = Fernet.generate_key().decode()
    assert crypto.encrypt("") == ""
    assert crypto.decrypt("") == ""
