"""Implementação do CalendarGateway usando a Google Calendar API."""
import uuid
from datetime import UTC, datetime

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from contexts.google.domain.entities.meeting import CalendarEvent, CreatedMeeting
from contexts.google.domain.ports.calendar_gateway import (
    CalendarError,
    CalendarGateway,
)


def _parse_dt(value: str) -> datetime:
    """Parseia date/dateTime do Google p/ datetime aware."""
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    dt = datetime.fromisoformat(value)
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


class GoogleCalendarGateway(CalendarGateway):
    """Operações na Agenda via google-api-python-client."""

    @staticmethod
    def _service(access_token: str):
        creds = Credentials(token=access_token)
        return build("calendar", "v3", credentials=creds, cache_discovery=False)

    def create_event(
        self,
        *,
        access_token: str,
        title: str,
        start: datetime,
        end: datetime,
        attendees: list[str],
        description: str = "",
        with_meet: bool = True,
        recurrence: list[str] | None = None,
    ) -> CreatedMeeting:
        body: dict = {
            "summary": title,
            "description": description,
            "start": {"dateTime": start.isoformat()},
            "end": {"dateTime": end.isoformat()},
            "attendees": [{"email": e} for e in attendees],
        }
        if recurrence:
            body["recurrence"] = recurrence
        params: dict = {
            "calendarId": "primary",
            "body": body,
            "sendUpdates": "all",
        }
        if with_meet:
            body["conferenceData"] = {
                "createRequest": {
                    "requestId": uuid.uuid4().hex,
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            }
            params["conferenceDataVersion"] = 1

        try:
            service = self._service(access_token)
            event = service.events().insert(**params).execute()
        except HttpError as exc:
            raise CalendarError(f"Erro ao criar evento: {exc}") from exc

        return CreatedMeeting(
            event_id=event["id"],
            meet_link=event.get("hangoutLink"),
            html_link=event.get("htmlLink", ""),
        )

    def update_event(
        self,
        *,
        access_token: str,
        event_id: str,
        title: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        attendees: list[str] | None = None,
        description: str | None = None,
    ) -> CreatedMeeting:
        body: dict = {}
        if title is not None:
            body["summary"] = title
        if start is not None:
            body["start"] = {"dateTime": start.isoformat()}
        if end is not None:
            body["end"] = {"dateTime": end.isoformat()}
        if attendees is not None:
            body["attendees"] = [{"email": e} for e in attendees]
        if description is not None:
            body["description"] = description

        try:
            service = self._service(access_token)
            event = (
                service.events()
                .patch(
                    calendarId="primary",
                    eventId=event_id,
                    body=body,
                    sendUpdates="all",
                )
                .execute()
            )
        except HttpError as exc:
            raise CalendarError(f"Erro ao atualizar evento: {exc}") from exc

        return CreatedMeeting(
            event_id=event["id"],
            meet_link=event.get("hangoutLink"),
            html_link=event.get("htmlLink", ""),
        )

    def delete_event(self, *, access_token: str, event_id: str) -> None:
        try:
            service = self._service(access_token)
            service.events().delete(
                calendarId="primary", eventId=event_id, sendUpdates="all"
            ).execute()
        except HttpError as exc:
            # 410 Gone = já tinha sido cancelado (ex.: pelo próprio Google Agenda
            # em outro dispositivo) — idempotente, não é erro do ponto de vista
            # do usuário: o resultado desejado (evento fora da agenda) já vale.
            if exc.resp.status not in (404, 410):
                raise CalendarError(f"Erro ao cancelar evento: {exc}") from exc

    def list_upcoming(
        self,
        *,
        access_token: str,
        max_results: int = 10,
        time_min: datetime | None = None,
        time_max: datetime | None = None,
    ) -> list[CalendarEvent]:
        params: dict = {
            "calendarId": "primary",
            "timeMin": (time_min or datetime.now(UTC)).isoformat(),
            "singleEvents": True,
            "orderBy": "startTime",
        }
        if time_max is not None:
            params["timeMax"] = time_max.isoformat()
        else:
            params["maxResults"] = max_results

        try:
            service = self._service(access_token)
            result = service.events().list(**params).execute()
        except HttpError as exc:
            raise CalendarError(f"Erro ao listar eventos: {exc}") from exc

        events: list[CalendarEvent] = []
        for item in result.get("items", []):
            start = item.get("start", {})
            end = item.get("end", {})
            all_day = "date" in start and "dateTime" not in start
            start_val = start.get("dateTime") or start.get("date")
            end_val = end.get("dateTime") or end.get("date")
            if not start_val or not end_val:
                continue
            events.append(
                CalendarEvent(
                    event_id=item["id"],
                    title=item.get("summary", "(sem título)"),
                    start=_parse_dt(start_val),
                    end=_parse_dt(end_val),
                    meet_link=item.get("hangoutLink"),
                    html_link=item.get("htmlLink", ""),
                    all_day=all_day,
                    attendees=[
                        a.get("email", "") for a in item.get("attendees", [])
                    ],
                    description=item.get("description", ""),
                    recurring_event_id=item.get("recurringEventId"),
                    organizer_email=item.get("organizer", {}).get("email", ""),
                )
            )
        return events

    def get_busy_intervals(
        self,
        *,
        access_token: str,
        time_min: datetime,
        time_max: datetime,
        emails: list[str],
    ) -> list[tuple[datetime, datetime]]:
        items = [{"id": "primary"}] + [{"id": e} for e in emails]
        body = {
            "timeMin": time_min.isoformat(),
            "timeMax": time_max.isoformat(),
            "items": items,
        }
        try:
            service = self._service(access_token)
            result = service.freebusy().query(body=body).execute()
        except HttpError as exc:
            raise CalendarError(f"Erro ao consultar disponibilidade: {exc}") from exc

        busy: list[tuple[datetime, datetime]] = []
        for cal in result.get("calendars", {}).values():
            for slot in cal.get("busy", []):
                busy.append((_parse_dt(slot["start"]), _parse_dt(slot["end"])))
        return busy
