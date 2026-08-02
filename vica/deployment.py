"""Helpers for command deployment scripts.

These helpers authenticate through Discord's HTTP API without opening the
gateway. The regular bot process remains responsible only for runtime work.
"""

from __future__ import annotations

from .bot import NeoVicaBot
from .config import ConfigError, load_config
from .db.chat_repository import ChatRepository
from .db.connection import Database
from .llm.provider import ResponsesProviderManager
from .logging_config import setup_logging


async def create_deployment_bot() -> NeoVicaBot:
    config = await load_config()
    setup_logging(config.logging)
    if config.discord.application_id is None:
        raise ConfigError(
            "'discord.application_id' e obrigatorio para deploy e limpeza de comandos."
        )

    database = Database(config.database.path)
    await database.connect()
    provider_manager = ResponsesProviderManager(
        config.llm, ChatRepository(database)
    )
    bot = NeoVicaBot(
        config,
        database,
        provider_manager,
        start_background_tasks=False,
    )
    try:
        await bot.login(config.discord.token)
    except Exception:
        await bot.close()
        raise
    return bot
