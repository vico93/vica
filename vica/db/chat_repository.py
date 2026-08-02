"""Repository for native LLM context identifiers."""

from __future__ import annotations

from .connection import Database


class ChatRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    async def get_context(self, channel_id: int, provider_name: str) -> str | None:
        row = await self.database.fetchone(
            "SELECT response_id FROM chat_contexts "
            "WHERE channel_id = ? AND provider_name = ?",
            (channel_id, provider_name),
        )
        return None if row is None else str(row["response_id"])

    async def save_context(self, channel_id: int, provider_name: str, response_id: str) -> None:
        await self.database.execute(
            "INSERT INTO chat_contexts(channel_id, provider_name, response_id) "
            "VALUES (?, ?, ?) "
            "ON CONFLICT(channel_id, provider_name) DO UPDATE SET "
            "response_id = excluded.response_id, updated_at = CURRENT_TIMESTAMP",
            (channel_id, provider_name, response_id),
        )

    async def clear_context(self, channel_id: int, provider_name: str) -> None:
        await self.database.execute(
            "DELETE FROM chat_contexts WHERE channel_id = ? AND provider_name = ?",
            (channel_id, provider_name),
        )
