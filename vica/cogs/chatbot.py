"""Chatbot triggers and per-server emoji configuration."""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict

import discord
from discord import app_commands
from discord.ext import commands

from ..db.access_repository import AccessRepository
from ..db.config_repository import ConfigRepository
from ..llm.provider import ProviderError, ResponsesProviderManager
from ..permissions import can_manage_config, interaction_member

logger = logging.getLogger(__name__)


class ChatbotCog(commands.Cog):
    def __init__(self, bot: commands.Bot, provider_manager: ResponsesProviderManager) -> None:
        self.bot = bot
        self.provider_manager = provider_manager
        self.config_repository = ConfigRepository(bot.database)
        self.access_repository = AccessRepository(bot.database)
        self._channel_locks: defaultdict[int, asyncio.Lock] = defaultdict(asyncio.Lock)

    @app_commands.command(
        name="chatbot-configurar-emoji",
        description="Define o emoji que dispara respostas por reacao.",
    )
    @app_commands.describe(emoji="Emoji Unicode ou emoji customizado do servidor")
    async def configure_emoji(self, interaction: discord.Interaction, emoji: str) -> None:
        member = interaction_member(interaction)
        if member is None or interaction.guild is None:
            await interaction.response.send_message(
                "Use este comando dentro de um servidor.", ephemeral=True
            )
            return
        if not await can_manage_config(interaction.guild, member, self.access_repository):
            await interaction.response.send_message(
                "Voce nao pode alterar configuracoes do chatbot.", ephemeral=True
            )
            return
        emoji = emoji.strip()
        if not emoji or len(emoji) > 100:
            await interaction.response.send_message("Informe um emoji valido.", ephemeral=True)
            return
        await self.config_repository.set_chatbot_emoji(interaction.guild.id, emoji)
        await interaction.response.send_message(
            f"Emoji de gatilho definido como {emoji}.", ephemeral=True
        )

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        if message.guild is None or message.author.bot:
            return
        if await self._is_reply_to_vica(message):
            await self._respond_to_message(message, "reply")

    @commands.Cog.listener()
    async def on_raw_reaction_add(self, payload: discord.RawReactionActionEvent) -> None:
        if payload.guild_id is None:
            return
        if await self._reaction_author_is_bot(payload):
            return
        configured_emoji = await self.config_repository.get_chatbot_emoji(payload.guild_id)
        if configured_emoji is None or str(payload.emoji) != configured_emoji:
            return
        channel = self.bot.get_channel(payload.channel_id)
        if channel is None:
            try:
                channel = await self.bot.fetch_channel(payload.channel_id)
            except discord.HTTPException:
                return
        if not hasattr(channel, "fetch_message"):
            return
        try:
            message = await channel.fetch_message(payload.message_id)
        except discord.HTTPException:
            return
        await self._respond_to_message(message, "reaction", payload.user_id)

    async def _is_reply_to_vica(self, message: discord.Message) -> bool:
        reference = message.reference
        if reference is None or reference.message_id is None:
            return False
        referenced = reference.resolved
        if not isinstance(referenced, discord.Message):
            try:
                referenced = await message.channel.fetch_message(reference.message_id)
            except discord.HTTPException:
                return False
        return self.bot.user is not None and referenced.author.id == self.bot.user.id

    async def _reaction_author_is_bot(self, payload: discord.RawReactionActionEvent) -> bool:
        if payload.member is not None:
            return payload.member.bot
        user = self.bot.get_user(payload.user_id)
        if user is None:
            try:
                user = await self.bot.fetch_user(payload.user_id)
            except discord.HTTPException:
                return True
        return user.bot

    async def _respond_to_message(
        self, message: discord.Message, trigger: str, trigger_user_id: int | None = None
    ) -> None:
        if message.guild is None or self.bot.user is None:
            return
        if trigger == "reaction" and trigger_user_id == self.bot.user.id:
            return

        content = message.content.strip() or "[mensagem sem texto]"
        if trigger == "reaction":
            prompt = f"Uma pessoa reagiu a esta mensagem no Discord:\n{content}"
        else:
            prompt = f"{message.author.display_name} respondeu a sua mensagem:\n{message.content}"

        lock = self._channel_locks[message.channel.id]
        async with lock:
            try:
                response = await self.provider_manager.respond(message.channel.id, prompt)
                await self._send_response(message, response)
            except (ProviderError, discord.HTTPException):
                logger.exception("Nao foi possivel responder no canal %s", message.channel.id)
                try:
                    await message.reply(
                        "Nao consegui responder agora. Tente novamente em alguns instantes.",
                        mention_author=False,
                    )
                except discord.HTTPException:
                    pass
                return

        rank_cog = self.bot.get_cog("RankCog")
        if rank_cog is not None:
            await rank_cog.award_vica_response(message.guild.id, message.channel.id, response)

    async def _send_response(self, trigger: discord.Message, response: str) -> None:
        chunks = [response[index : index + 2000] for index in range(0, len(response), 2000)]
        if not chunks:
            raise ProviderError("LLM retornou resposta vazia")
        await trigger.reply(
            chunks[0],
            mention_author=False,
            allowed_mentions=discord.AllowedMentions.none(),
        )
        for chunk in chunks[1:]:
            await trigger.channel.send(
                chunk,
                allowed_mentions=discord.AllowedMentions.none(),
            )
