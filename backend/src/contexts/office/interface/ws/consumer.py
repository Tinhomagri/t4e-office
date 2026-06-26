"""Stub do OfficeConsumer — implementação real em Task 2."""
from channels.generic.websocket import AsyncWebsocketConsumer


class OfficeConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer para o escritório 2D (stub)."""

    async def connect(self) -> None:
        await self.accept()

    async def disconnect(self, code: int) -> None:
        pass

    async def receive(self, text_data: str = "", bytes_data: bytes = b"") -> None:
        pass
