"""Async SQLite connection and migration handling."""

from __future__ import annotations

import asyncio
import re
from pathlib import Path
from typing import Any, Iterable

import aiosqlite


class Database:
    def __init__(self, path: Path, migrations_path: Path | None = None) -> None:
        self.path = path
        self.migrations_path = migrations_path or Path(__file__).parents[2] / "migrations"
        self._connection: aiosqlite.Connection | None = None

    @property
    def connection(self) -> aiosqlite.Connection:
        if self._connection is None:
            raise RuntimeError("Banco de dados ainda nao foi conectado.")
        return self._connection

    async def connect(self) -> None:
        await asyncio.to_thread(self.path.parent.mkdir, parents=True, exist_ok=True)
        self._connection = await aiosqlite.connect(self.path)
        self.connection.row_factory = aiosqlite.Row
        await self.connection.execute("PRAGMA journal_mode=WAL")
        await self.connection.execute("PRAGMA foreign_keys=ON")
        await self.connection.execute("PRAGMA busy_timeout=5000")
        await self.connection.commit()
        await self._apply_migrations()

    async def _apply_migrations(self) -> None:
        await self.connection.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations "
            "(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        )
        rows = await self.fetchall("SELECT version FROM schema_migrations")
        applied = {int(row["version"]) for row in rows}
        migration_files = sorted(self.migrations_path.glob("*.sql"))
        for migration_file in migration_files:
            match = re.match(r"^(\d+)_.*\.sql$", migration_file.name)
            if match is None:
                continue
            version = int(match.group(1))
            if version in applied:
                continue
            script = await asyncio.to_thread(migration_file.read_text, encoding="utf-8")
            await self.connection.executescript(script)
            await self.connection.execute(
                "INSERT INTO schema_migrations(version) VALUES (?)", (version,)
            )
            await self.connection.commit()

    async def execute(self, query: str, parameters: Iterable[Any] = ()) -> None:
        await self.connection.execute(query, tuple(parameters))
        await self.connection.commit()

    async def fetchone(
        self, query: str, parameters: Iterable[Any] = ()
    ) -> aiosqlite.Row | None:
        async with self.connection.execute(query, tuple(parameters)) as cursor:
            return await cursor.fetchone()

    async def fetchall(
        self, query: str, parameters: Iterable[Any] = ()
    ) -> list[aiosqlite.Row]:
        async with self.connection.execute(query, tuple(parameters)) as cursor:
            return await cursor.fetchall()

    async def close(self) -> None:
        if self._connection is not None:
            await self._connection.close()
            self._connection = None
