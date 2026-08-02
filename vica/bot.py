"""Discord client setup and cog registration."""

from __future__ import annotations

import logging

import discord
from discord.ext import commands

from .cogs.access import AccessCog
from .cogs.chatbot import ChatbotCog
from .cogs.rank import RankCog
from .config import AppConfig
from .db.connection import Database
from .llm.provider import ResponsesProviderManager

logger = logging.getLogger(__name__)


class NeoVicaBot(commands.Bot):
    def __init__(
        self,
        config: AppConfig,
        database: Database,
        provider_manager: ResponsesProviderManager,
        start_background_tasks: bool = True,
    ) -> None:
        intents = discord.Intents.none()
        intents.guilds = True
        intents.members = True
        intents.messages = True
        intents.message_content = True
        intents.reactions = True
        intents.voice_states = True
        kwargs = {}
        if config.discord.application_id is not None:
            kwargs["application_id"] = config.discord.application_id
        super().__init__(
            command_prefix=commands.when_mentioned,
            intents=intents,
            **kwargs,
        )
        self.config = config
        self.database = database
        self.provider_manager = provider_manager
        self.start_background_tasks = start_background_tasks
        self._cogs_registered = False

    async def setup_hook(self) -> None:
        await self.register_cogs()

    async def register_cogs(self) -> None:
        if self._cogs_registered:
            return
        await self.add_cog(RankCog(self, self.config, self.start_background_tasks))
        await self.add_cog(AccessCog(self))
        await self.add_cog(ChatbotCog(self, self.provider_manager))
        self._cogs_registered = True

    async def sync_commands(self, guild_id: int | None = None) -> list[discord.app_commands.AppCommand]:
        await self.register_cogs()
        if guild_id is None:
            synced = await self.tree.sync()
            logger.info("Sincronizados %d comandos globalmente", len(synced))
            return synced

        guild = discord.Object(id=guild_id)
        self.tree.copy_global_to(guild=guild)
        synced = await self.tree.sync(guild=guild)
        logger.info("Sincronizados %d comandos no guild %s", len(synced), guild_id)
        return synced

    async def on_ready(self) -> None:
        if self.user is not None:
            logger.info(
                "Conectado como %s (%s) em %d guild(s)",
                self.user,
                self.user.id,
                len(self.guilds),
            )

    async def close(self) -> None:
        rank_cog = self.get_cog("RankCog")
        if rank_cog is not None:
            rank_cog.cog_unload()
        try:
            await super().close()
        finally:
            await self.provider_manager.close()
            await self.database.close()
