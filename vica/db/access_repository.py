"""Repository for NeoVica's per-guild admin and moderator lists."""

from __future__ import annotations

from collections.abc import Iterable

from .connection import Database


class AccessRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    async def add(
        self, guild_id: int, access_level: str, subject_type: str, subject_id: int
    ) -> None:
        await self.database.execute(
            "INSERT OR IGNORE INTO access_entries "
            "(guild_id, access_level, subject_type, subject_id) VALUES (?, ?, ?, ?)",
            (guild_id, access_level, subject_type, subject_id),
        )

    async def remove(
        self, guild_id: int, access_level: str, subject_type: str, subject_id: int
    ) -> None:
        await self.database.execute(
            "DELETE FROM access_entries WHERE guild_id = ? AND access_level = ? "
            "AND subject_type = ? AND subject_id = ?",
            (guild_id, access_level, subject_type, subject_id),
        )

    async def has_access(
        self,
        guild_id: int,
        access_level: str,
        member_id: int,
        role_ids: Iterable[int],
    ) -> bool:
        role_ids = tuple(role_ids)
        if role_ids:
            placeholders = ",".join("?" for _ in role_ids)
            query = (
                "SELECT 1 FROM access_entries WHERE guild_id = ? AND access_level = ? "
                "AND ((subject_type = 'member' AND subject_id = ?) "
                f"OR (subject_type = 'role' AND subject_id IN ({placeholders}))) LIMIT 1"
            )
            parameters = (guild_id, access_level, member_id, *role_ids)
        else:
            query = (
                "SELECT 1 FROM access_entries WHERE guild_id = ? AND access_level = ? "
                "AND subject_type = 'member' AND subject_id = ? LIMIT 1"
            )
            parameters = (guild_id, access_level, member_id)
        return await self.database.fetchone(query, parameters) is not None

    async def list_entries(self, guild_id: int, access_level: str) -> list[tuple[str, int]]:
        rows = await self.database.fetchall(
            "SELECT subject_type, subject_id FROM access_entries "
            "WHERE guild_id = ? AND access_level = ? "
            "ORDER BY subject_type, subject_id",
            (guild_id, access_level),
        )
        return [(str(row["subject_type"]), int(row["subject_id"])) for row in rows]
