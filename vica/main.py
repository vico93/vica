"""NeoVica process entrypoint."""

from __future__ import annotations

import asyncio
import logging

from .bot import NeoVicaBot
from .config import load_config
from .db.chat_repository import ChatRepository
from .db.connection import Database
from .llm.provider import ResponsesProviderManager
from .logging_config import setup_logging


async def run() -> None:
    config = await load_config()
    setup_logging(config.logging)
    logger = logging.getLogger(__name__)
    database = Database(config.database.path)
    await database.connect()
    provider_manager = ResponsesProviderManager(
        config.llm, ChatRepository(database)
    )
    bot = NeoVicaBot(config, database, provider_manager)
    logger.info("Iniciando NeoVica")
    try:
        await bot.start(config.discord.token)
    finally:
        await bot.close()


def main() -> None:
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        logging.getLogger(__name__).info("NeoVica encerrada pelo operador")
