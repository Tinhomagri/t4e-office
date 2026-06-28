"""Implementações Django dos repositórios do contexto google."""
from contexts.google.domain.entities.connection import (
    ConnectionStatus,
    GoogleConnection,
)
from contexts.google.domain.entities.meeting import MeetingRef
from contexts.google.domain.repositories.connection_repository import (
    ConnectionRepository,
)
from contexts.google.domain.repositories.meeting_ref_repository import (
    MeetingRefRepository,
)
from contexts.google.domain.repositories.oauth_state_repository import (
    OAuthStateRepository,
)
from contexts.google.infrastructure.django.crypto import decrypt, encrypt
from contexts.google.infrastructure.django.models import (
    GoogleConnectionModel,
    MeetingRefModel,
    OAuthStateModel,
)


def _to_connection_entity(row: GoogleConnectionModel) -> GoogleConnection:
    return GoogleConnection(
        id=str(row.id),
        user_id=str(row.user_id),
        google_email=row.google_email,
        refresh_token=decrypt(row.refresh_token),
        access_token=decrypt(row.access_token),
        expiry=row.expiry,
        scopes=list(row.scopes or []),
        status=ConnectionStatus(row.status),
    )


class DjangoConnectionRepository(ConnectionRepository):
    """Persistência de conexões Google via Django ORM (tokens cifrados)."""

    def get_by_user(self, *, user_id: str) -> GoogleConnection | None:
        row = GoogleConnectionModel.objects.filter(user_id=user_id).first()
        return _to_connection_entity(row) if row else None

    def upsert(self, *, connection: GoogleConnection) -> GoogleConnection:
        row, _ = GoogleConnectionModel.objects.update_or_create(
            user_id=connection.user_id,
            defaults={
                "google_email": connection.google_email,
                "refresh_token": encrypt(connection.refresh_token),
                "access_token": encrypt(connection.access_token),
                "expiry": connection.expiry,
                "scopes": connection.scopes,
                "status": connection.status.value,
            },
        )
        return _to_connection_entity(row)

    def delete(self, *, user_id: str) -> None:
        GoogleConnectionModel.objects.filter(user_id=user_id).delete()


class DjangoOAuthStateRepository(OAuthStateRepository):
    """Persistência de states OAuth via Django ORM."""

    def create(self, *, state: str, user_id: str) -> None:
        OAuthStateModel.objects.create(state=state, user_id=user_id)

    def consume(self, *, state: str) -> str | None:
        row = OAuthStateModel.objects.filter(state=state).first()
        if row is None:
            return None
        user_id = str(row.user_id)
        expired = row.is_expired
        row.delete()  # one-time: invalida sempre
        return None if expired else user_id


class DjangoMeetingRefRepository(MeetingRefRepository):
    """Persistência de referências de reunião via Django ORM."""

    def create(self, *, ref: MeetingRef) -> MeetingRef:
        row = MeetingRefModel.objects.create(
            user_id=ref.user_id,
            google_event_id=ref.google_event_id,
            card_id=ref.card_id,
        )
        return MeetingRef(
            id=str(row.id),
            user_id=str(row.user_id),
            google_event_id=row.google_event_id,
            card_id=str(row.card_id) if row.card_id else None,
        )
