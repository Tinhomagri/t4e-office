"""Caso de uso: redefinir senha via token."""
from shared.domain.errors import NotFoundError, ValidationError


class ResetPassword:
    """Valida token e redefine senha do usuário."""

    def execute(self, *, token: str, new_password: str) -> None:
        from contexts.identity.infrastructure.django.models import PasswordResetToken

        try:
            obj = PasswordResetToken.objects.select_related("user").get(token=token)
        except PasswordResetToken.DoesNotExist as exc:
            raise NotFoundError("Token inválido.") from exc

        if obj.is_expired:
            raise ValidationError("Token expirado. Solicite um novo link.")

        user = obj.user
        user.set_password(new_password)
        user.save(update_fields=["password"])
        obj.delete()
