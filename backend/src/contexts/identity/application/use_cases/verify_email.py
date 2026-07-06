"""Caso de uso: verificação de email via token."""
from shared.domain.errors import NotFoundError, ValidationError


class VerifyEmail:
    """Ativa a conta do usuário se o token for válido e não expirado."""

    def execute(self, *, token: str) -> None:
        from contexts.identity.infrastructure.django.models import (
            EmailVerificationToken,
            UserModel,
        )

        try:
            obj = EmailVerificationToken.objects.select_related("user").get(token=token)
        except EmailVerificationToken.DoesNotExist as exc:
            raise NotFoundError("Token inválido.") from exc

        if obj.is_expired:
            raise ValidationError("Token expirado. Solicite um novo email de verificação.")

        user: UserModel = obj.user
        user.email_verified = True
        user.is_active = True
        user.save(update_fields=["email_verified", "is_active"])
        obj.delete()
