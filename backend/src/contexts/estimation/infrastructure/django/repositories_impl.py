from datetime import timedelta

from django.utils import timezone

from contexts.estimation.domain.entities.poker_session import (
    PokerParticipant,
    PokerSession,
    PokerVote,
    SessionStatus,
)
from contexts.estimation.domain.repositories.poker_repository import (
    PokerParticipantRepository,
    PokerSessionRepository,
    PokerVoteRepository,
)
from contexts.estimation.infrastructure.django.models import (
    PokerParticipantModel,
    PokerSessionModel,
    PokerVoteModel,
)

ACTIVE_THRESHOLD = timedelta(seconds=30)


def _initials(name: str) -> str:
    parts = name.strip().split()
    if len(parts) >= 2:
        return (parts[0][0] + parts[-1][0]).upper()
    return name[:2].upper() if name else "??"


def _session_to_entity(row: PokerSessionModel) -> PokerSession:
    return PokerSession(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        project_id=str(row.project_id),
        created_by=str(row.created_by_id),
        name=row.name,
        status=SessionStatus(row.status),
        current_card_id=str(row.current_card_id) if row.current_card_id else None,
        card_ids=[str(c) for c in (row.card_ids or [])],
        created_at=row.created_at,
    )


def _participant_to_entity(row: PokerParticipantModel) -> PokerParticipant:
    name = getattr(row, "_user_name", None) or ""
    return PokerParticipant(
        id=str(row.id),
        session_id=str(row.session_id),
        user_id=str(row.user_id),
        user_name=name,
        avatar_initials=_initials(name),
        joined_at=row.joined_at,
        last_seen=row.last_seen,
        is_host=row.is_host,
    )


class DjangoPokerSessionRepository(PokerSessionRepository):
    def create(self, session: PokerSession) -> PokerSession:
        row = PokerSessionModel.objects.create(
            workspace_id=session.workspace_id,
            project_id=session.project_id,
            created_by_id=session.created_by,
            name=session.name,
            status=session.status.value,
            card_ids=session.card_ids,
        )
        return _session_to_entity(row)

    def get(self, session_id: str) -> PokerSession | None:
        try:
            return _session_to_entity(PokerSessionModel.objects.get(id=session_id))
        except PokerSessionModel.DoesNotExist:
            return None

    def update(self, session: PokerSession) -> PokerSession:
        PokerSessionModel.objects.filter(id=session.id).update(
            status=session.status.value,
            current_card_id=session.current_card_id,
            card_ids=session.card_ids,
        )
        return session

    def list_by_workspace(self, workspace_id: str) -> list[PokerSession]:
        return [
            _session_to_entity(r)
            for r in PokerSessionModel.objects.filter(workspace_id=workspace_id)
        ]

    def list_by_project(self, project_id: str) -> list[PokerSession]:
        return [
            _session_to_entity(r)
            for r in PokerSessionModel.objects.filter(project_id=project_id).exclude(
                status="done"
            )
        ]


class DjangoPokerParticipantRepository(PokerParticipantRepository):
    def join(self, participant: PokerParticipant) -> PokerParticipant:
        row, _ = PokerParticipantModel.objects.get_or_create(
            session_id=participant.session_id,
            user_id=participant.user_id,
            defaults={"is_host": participant.is_host},
        )
        row.last_seen = timezone.now()
        row.save(update_fields=["last_seen"])
        row._user_name = participant.user_name
        return _participant_to_entity(row)

    def get_by_user(self, session_id: str, user_id: str) -> PokerParticipant | None:
        try:
            row = PokerParticipantModel.objects.select_related("user").get(
                session_id=session_id, user_id=user_id
            )
            row._user_name = row.user.full_name
            return _participant_to_entity(row)
        except PokerParticipantModel.DoesNotExist:
            return None

    def list_active(self, session_id: str) -> list[PokerParticipant]:
        cutoff = timezone.now() - ACTIVE_THRESHOLD
        rows = PokerParticipantModel.objects.filter(
            session_id=session_id, last_seen__gte=cutoff
        ).select_related("user")
        result = []
        for row in rows:
            row._user_name = row.user.full_name
            result.append(_participant_to_entity(row))
        return result

    def touch(self, session_id: str, user_id: str) -> None:
        PokerParticipantModel.objects.filter(
            session_id=session_id, user_id=user_id
        ).update(last_seen=timezone.now())

    def leave(self, session_id: str, user_id: str) -> None:
        PokerParticipantModel.objects.filter(
            session_id=session_id, user_id=user_id
        ).delete()


class DjangoPokerVoteRepository(PokerVoteRepository):
    def upsert(self, vote: PokerVote) -> PokerVote:
        participant = PokerParticipantModel.objects.get(
            session_id=vote.session_id, user_id=vote.participant_id
        )
        row, _ = PokerVoteModel.objects.update_or_create(
            session_id=vote.session_id,
            card_id=vote.card_id,
            participant=participant,
            defaults={"value": vote.value},
        )
        return PokerVote(
            id=str(row.id),
            session_id=str(row.session_id),
            card_id=str(row.card_id),
            participant_id=str(participant.user_id),
            value=row.value,
        )

    def list_by_card(self, session_id: str, card_id: str) -> list[PokerVote]:
        rows = PokerVoteModel.objects.filter(
            session_id=session_id, card_id=card_id
        ).select_related("participant__user")
        return [
            PokerVote(
                id=str(r.id),
                session_id=str(r.session_id),
                card_id=str(r.card_id),
                participant_id=str(r.participant.user_id),
                value=r.value,
                participant_name=r.participant.user.full_name,
            )
            for r in rows
        ]

    def clear_card(self, session_id: str, card_id: str) -> None:
        PokerVoteModel.objects.filter(session_id=session_id, card_id=card_id).delete()
