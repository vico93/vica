"""Repository for per-guild chatbot settings."""

from __future__ import annotations

from .connection import Database


class ConfigRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    async def get_chatbot_emoji(self, guild_id: int) -> str | None:
        row = await self.database.fetchone(
            "SELECT chatbot_emoji FROM guild_settings WHERE guild_id = ?", (guild_id,)
        )
        return None if row is None else row["chatbot_emoji"]

    async def set_chatbot_emoji(self, guild_id: int, emoji: str) -> None:
        await self.database.execute(
            "INSERT INTO guild_settings(guild_id, chatbot_emoji) VALUES (?, ?) "
            "ON CONFLICT(guild_id) DO UPDATE SET chatbot_emoji = excluded.chatbot_emoji",
            (guild_id, emoji),
        )

    async def get_vica_multiplier(self, guild_id: int, default: float) -> float:
        row = await self.database.fetchone(
            "SELECT vica_multiplier FROM guild_settings WHERE guild_id = ?", (guild_id,)
        )
        return default if row is None else float(row["vica_multiplier"])
