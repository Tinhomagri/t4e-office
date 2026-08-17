"""Caso de uso: buscar arquivos no Drive do usuário."""
from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.domain.entities.drive_file import DriveFile
from contexts.google.domain.ports.drive_gateway import DriveGateway


class SearchDriveFiles:
    """Busca arquivos que o usuário pode ver, por texto livre."""

    def __init__(
        self,
        *,
        drive_gateway: DriveGateway,
        get_valid_credentials: GetValidCredentials,
    ):
        self.drive_gateway = drive_gateway
        self.get_valid_credentials = get_valid_credentials

    def execute(
        self, *, user_id: str, query: str, max_results: int = 10
    ) -> list[DriveFile]:
        access_token = self.get_valid_credentials.execute(user_id=user_id)
        return self.drive_gateway.search_files(
            access_token=access_token, query=query, max_results=max_results
        )
