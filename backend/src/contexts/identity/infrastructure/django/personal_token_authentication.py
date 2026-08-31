"""Autenticação DRF por token pessoal (Personal Access Token).

Convive com JWTAuthentication em DEFAULT_AUTHENTICATION_CLASSES — o DRF tenta
cada classe em ordem até uma autenticar ou todas falharem (None é "não tentou",
não é erro).
"""
import hashlib
import secrets

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

TOKEN_PREFIX = "t4e_pat_"


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_token() -> tuple[str, str]:
    """Gera (token_em_texto_puro, hash). O texto puro só existe aqui — nunca é salvo."""
    raw = TOKEN_PREFIX + secrets.token_urlsafe(32)
    return raw, hash_token(raw)


class PersonalTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        from contexts.identity.infrastructure.django.models import PersonalAccessToken

        header = request.META.get("HTTP_AUTHORIZATION", "")
        if not header.startswith("Bearer "):
            return None
        raw_token = header[len("Bearer "):].strip()
        if not raw_token.startswith(TOKEN_PREFIX):
            return None  # deixa a JWTAuthentication tentar

        digest = hash_token(raw_token)
        try:
            token = PersonalAccessToken.objects.select_related("user").get(
                token_hash=digest, revoked_at__isnull=True
            )
        except PersonalAccessToken.DoesNotExist:
            raise AuthenticationFailed("Token inválido ou revogado.")

        PersonalAccessToken.objects.filter(pk=token.pk).update(last_used_at=timezone.now())
        return (token.user, None)

    def authenticate_header(self, request):
        return "Bearer"
