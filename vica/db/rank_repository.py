"""Repository for EXP, role multipliers and blacklisted channels."""

from __future__ import annotations

from collections.abc import Iterable

from .connection import Database


class RankRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    async def add_experience(self, guild_id: int, user_id: int, amount: int) -> int:
        if amount <= 0:
            row = await self.database.fetchone(
                "SELECT xp FROM member_experience WHERE guild_id = ? AND user_id = ?",
                (guild_id, user_id),
            )
            return 0 if row is None else int(row["xp"])
        await self.database.execute(
            "INSERT INTO member_experience(guild_id, user_id, xp) VALUES (?, ?, ?) "
            "ON CONFLICT(guild_id, user_id) DO UPDATE SET "
            "xp = member_experience.xp + excluded.xp",
            (guild_id, user_id, amount),
        )
        row = await self.database.fetchone(
            "SELECT xp FROM member_experience WHERE guild_id = ? AND user_id = ?",
            (guild_id, user_id),
        )
        return int(row["xp"])

    async def top_experience(self, guild_id: int, limit: int = 10) -> list[tuple[int, int]]:
        rows = await self.database.fetchall(
            "SELECT user_id, xp FROM member_experience "
            "WHERE guild_id = ? ORDER BY xp DESC, user_id ASC LIMIT ?",
            (guild_id, limit),
        )
        return [(int(row["user_id"]), int(row["xp"])) for row in rows]

    async def set_role_multiplier(self, guild_id: int, role_id: int, multiplier: float) -> None:
        await self.database.execute(
            "INSERT INTO role_multipliers(guild_id, role_id, multiplier) VALUES (?, ?, ?) "
            "ON CONFLICT(guild_id, role_id) DO UPDATE SET multiplier = excluded.multiplier",
            (guild_id, role_id, multiplier),
        )

    async def remove_role_multiplier(self, guild_id: int, role_id: int) -> None:
        await self.database.execute(
            "DELETE FROM role_multipliers WHERE guild_id = ? AND role_id = ?",
            (guild_id, role_id),
        )

    async def get_role_multipliers(self, guild_id: int) -> dict[int, float]:
        rows = await self.database.fetchall(
            "SELECT role_id, multiplier FROM role_multipliers WHERE guild_id = ?", (guild_id,)
        )
        return {int(row["role_id"]): float(row["multiplier"]) for row in rows}

    async def is_blacklisted(self, guild_id: int, channel_id: int) -> bool:
        row = await self.database.fetchone(
            "SELECT 1 FROM blacklisted_channels WHERE guild_id = ? AND channel_id = ?",
            (guild_id, channel_id),
        )
        return row is not None

    async def add_blacklisted_channel(self, guild_id: int, channel_id: int) -> None:
        await self.database.execute(
            "INSERT OR IGNORE INTO blacklisted_channels(guild_id, channel_id) VALUES (?, ?)",
            (guild_id, channel_id),
        )

    async def remove_blacklisted_channel(self, guild_id: int, channel_id: int) -> None:
        await self.database.execute(
            "DELETE FROM blacklisted_channels WHERE guild_id = ? AND channel_id = ?",
            (guild_id, channel_id),
        )

    async def blacklisted_channels(self, guild_id: int) -> set[int]:
        rows = await self.database.fetchall(
            "SELECT channel_id FROM blacklisted_channels WHERE guild_id = ?", (guild_id,)
        )
        return {int(row["channel_id"]) for row in rows}

    async def max_role_multiplier(
        self, guild_id: int, role_ids: Iterable[int], default: float = 1.0
    ) -> float:
        multipliers = await self.get_role_multipliers(guild_id)
        configured = [multipliers[role_id] for role_id in role_ids if role_id in multipliers]
        return max(configured, default=default)
