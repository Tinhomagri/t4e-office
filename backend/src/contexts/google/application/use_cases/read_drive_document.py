"""Caso de uso: ler o conteúdo em texto de um arquivo do Drive."""
from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.domain.ports.drive_gateway import DriveGateway


class ReadDriveDocument:
    """Devolve o texto de um documento do Drive (Doc do Google ou texto puro)."""

    def __init__(
        self,
        *,
        drive_gateway: DriveGateway,
        get_valid_credentials: GetValidCredentials,
    ):
        self.drive_gateway = drive_gateway
        self.get_valid_credentials = get_valid_credentials

    def execute(self, *, user_id: str, file_id: str) -> str:
        access_token = self.get_valid_credentials.execute(user_id=user_id)
        return self.drive_gateway.read_text(access_token=access_token, file_id=file_id)
