"""Configuração cifrada da biblioteca de mídia no Google Drive."""
from dataclasses import dataclass

from contexts.github.infrastructure.django.crypto import decrypt, encrypt
from contexts.integrations.infrastructure.django.models import WorkspaceDriveConfigModel
from shared.domain.errors import ValidationError


@dataclass(frozen=True)
class DriveCredentials:
    client_id: str
    client_secret: str
    refresh_token: str
    takes_folder_id: str
    projects_folder_id: str


def _hint(value: str) -> str:
    return f"••••{value[-4:]}" if len(value) >= 4 else ("••••" if value else "")


def _plain(value: str) -> str:
    return decrypt(value) if value else ""


def get_config(workspace_id: str) -> WorkspaceDriveConfigModel | None:
    return WorkspaceDriveConfigModel.objects.filter(workspace_id=workspace_id).first()


def public_config(cfg: WorkspaceDriveConfigModel | None) -> dict:
    if cfg is None:
        return {
            "configured": False,
            "oauth_ready": False,
            "is_active": True,
            "hints": {},
            "updated_at": None,
        }
    values = {
        "client_id": cfg.client_id_encrypted,
        "client_secret": cfg.client_secret_encrypted,
        "refresh_token": cfg.refresh_token_encrypted,
        "takes_folder_id": cfg.takes_folder_id_encrypted,
        "projects_folder_id": cfg.projects_folder_id_encrypted,
    }
    hints = {}
    for key, value in values.items():
        try:
            hints[key] = _hint(_plain(value))
        except Exception:
            hints[key] = "••••" if value else ""
    return {
        "configured": all(bool(value) for value in values.values()),
        # ID, Secret e as duas raízes bastam para iniciar o OAuth. O refresh
        # token só existe depois que o dono autoriza sua conta Google.
        "oauth_ready": all(bool(values[key]) for key in (
            "client_id", "client_secret", "takes_folder_id", "projects_folder_id"
        )),
        "is_active": cfg.is_active,
        "hints": hints,
        "updated_at": cfg.updated_at.isoformat() if cfg.updated_at else None,
    }


def save_config(*, workspace_id: str, actor_id: str, values: dict, is_active: bool) -> WorkspaceDriveConfigModel:
    cfg = get_config(workspace_id) or WorkspaceDriveConfigModel(workspace_id=workspace_id)
    fields = {
        "client_id": "client_id_encrypted",
        "client_secret": "client_secret_encrypted",
        "refresh_token": "refresh_token_encrypted",
        "takes_folder_id": "takes_folder_id_encrypted",
        "projects_folder_id": "projects_folder_id_encrypted",
    }
    for incoming, field in fields.items():
        value = str(values.get(incoming) or "").strip()
        if value:
            setattr(cfg, field, encrypt(value))
    required_before_oauth = (
        "client_id_encrypted", "client_secret_encrypted", "takes_folder_id_encrypted",
        "projects_folder_id_encrypted",
    )
    if not all(bool(getattr(cfg, field)) for field in required_before_oauth):
        raise ValidationError("Preencha Client ID, Client Secret e as duas pastas do Drive.")
    cfg.is_active = is_active
    cfg.updated_by_id = actor_id
    cfg.save()
    return cfg


def oauth_client_for_workspace(workspace_id: str) -> tuple[str, str]:
    """Credenciais do app necessárias para iniciar/trocar o código OAuth."""
    cfg = get_config(workspace_id)
    if cfg is None:
        raise ValidationError("Configure primeiro o Client ID e Client Secret do Google Drive.")
    client_id = _plain(cfg.client_id_encrypted)
    client_secret = _plain(cfg.client_secret_encrypted)
    if not client_id or not client_secret:
        raise ValidationError("Configure primeiro o Client ID e Client Secret do Google Drive.")
    return client_id, client_secret


def credentials_for_workspace(workspace_id: str) -> DriveCredentials:
    cfg = get_config(workspace_id)
    if cfg is None or not cfg.is_active:
        raise ValidationError("Google Drive não está configurado neste workspace.")
    values = [_plain(getattr(cfg, field)) for field in (
        "client_id_encrypted", "client_secret_encrypted", "refresh_token_encrypted",
        "takes_folder_id_encrypted", "projects_folder_id_encrypted",
    )]
    if not all(values):
        raise ValidationError("A configuração do Google Drive está incompleta.")
    return DriveCredentials(*values)
