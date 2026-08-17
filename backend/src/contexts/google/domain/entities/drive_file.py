"""Estruturas de domínio para arquivos do Google Drive."""
from dataclasses import dataclass


@dataclass
class DriveFile:
    """Metadados de um arquivo do Drive — o suficiente para a IA decidir se
    vale ler o conteúdo."""

    file_id: str
    name: str
    mime_type: str
    modified_time: str
    web_view_link: str
