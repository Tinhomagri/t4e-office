"""Porta de saída: envio de emails transacionais de identidade."""
from abc import ABC, abstractmethod


class EmailSender(ABC):
    @abstractmethod
    def send_verification(self, *, to_email: str, full_name: str, token: str) -> None:
        """Envia email com link de verificação."""

    @abstractmethod
    def send_password_reset(self, *, to_email: str, full_name: str, token: str) -> None:
        """Envia email com link de redefinição de senha."""

    @abstractmethod
    def send_invitation(
        self,
        *,
        to_email: str,
        workspace_name: str,
        inviter_name: str,
        token: str,
        role: str = "",
    ) -> None:
        """Envia email com link de convite para um workspace.

        `role` só decora a mensagem ("Seu acesso: Administrador") — quem manda no
        acesso real é o convite gravado, nunca o texto do email.
        """
