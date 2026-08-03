"""Chatbot triggers, prompt metadata, and per-server emoji configuration."""

from __future__ import annotations

import asyncio
import logging
import re
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

    @app_commands.command(
        name="trigger",
        description="Envia um pedido direto para a Vica.",
    )
    @app_commands.describe(texto="Texto que a Vica deve responder")
    async def trigger(self, interaction: discord.Interaction, texto: str) -> None:
        if interaction.guild is None or interaction.channel_id is None:
            await interaction.response.send_message(
                "Use este comando dentro de um servidor.", ephemeral=True
            )
            return

        texto = texto.strip()
        if not texto:
            await interaction.response.send_message(
                "Informe o texto que a Vica deve responder.", ephemeral=True
            )
            return

        await interaction.response.defer()
        prompt = f"[trigger]{texto}[/trigger]"
        lock = self._channel_locks[interaction.channel_id]
        async with lock:
            try:
                response = await self.provider_manager.respond(
                    interaction.channel_id, prompt
                )
                await self._send_interaction_response(interaction, response)
            except (ProviderError, discord.HTTPException):
                logger.exception(
                    "Nao foi possivel responder ao trigger no canal %s",
                    interaction.channel_id,
                )
                try:
                    await interaction.edit_original_response(
                        content="Nao consegui responder agora. Tente novamente em alguns instantes.",
                        allowed_mentions=discord.AllowedMentions.none(),
                    )
                except discord.HTTPException:
                    pass
                return

        rank_cog = self.bot.get_cog("RankCog")
        if rank_cog is not None:
            await rank_cog.award_vica_response(
                interaction.guild.id, interaction.channel_id, response
            )

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        if message.guild is None or message.author.bot:
            return

        is_reply = await self._is_reply_to_vica(message)
        is_mention = self._mentions_vica(message)
        responds_to_everyone = (
            self.bot.config.chatbot.respond_to_everyone and message.mention_everyone
        )
        if not (is_reply or is_mention or responds_to_everyone):
            return

        source = "reply" if is_reply else "mention"
        if responds_to_everyone and not is_reply and not is_mention:
            source = "everyone"
        await self._respond_to_message(message, source)

    @commands.Cog.listener()
    async def on_raw_reaction_add(self, payload: discord.RawReactionActionEvent) -> None:
        if payload.guild_id is None:
            return
        configured_emoji = await self.config_repository.get_chatbot_emoji(payload.guild_id)
        if configured_emoji is None or str(payload.emoji) != configured_emoji:
            return

        reaction_author = await self._get_reaction_author(payload)
        if reaction_author is None or reaction_author.bot:
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
        await self._respond_to_message(
            message,
            "reaction",
            reaction_author=reaction_author,
            reaction_emoji=str(payload.emoji),
        )

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

    def _mentions_vica(self, message: discord.Message) -> bool:
        return self.bot.user is not None and any(
            mentioned_user.id == self.bot.user.id for mentioned_user in message.mentions
        )

    async def _get_reaction_author(
        self, payload: discord.RawReactionActionEvent
    ) -> discord.User | discord.Member | None:
        if payload.member is not None:
            return payload.member
        user = self.bot.get_user(payload.user_id)
        if user is not None:
            return user
        try:
            return await self.bot.fetch_user(payload.user_id)
        except discord.HTTPException:
            return None

    async def _respond_to_message(
        self,
        message: discord.Message,
        source: str,
        *,
        reaction_author: discord.User | discord.Member | None = None,
        reaction_emoji: str | None = None,
    ) -> None:
        if message.guild is None or self.bot.user is None:
            return
        if source == "reaction":
            if reaction_author is None or reaction_author.id == self.bot.user.id:
                return
            if reaction_emoji is None:
                return
            prompt = self._format_reaction_prompt(message, reaction_author, reaction_emoji)
        else:
            prompt = self._format_message_prompt(message)

        lock = self._channel_locks[message.channel.id]
        async with lock:
            try:
                response = await self.provider_manager.respond(message.channel.id, prompt)
                await self._send_response(message, response)
            except (ProviderError, discord.HTTPException):
                logger.exception("Nao foi possivel responder no canal %s", message.channel.id)
                await self._send_message_error(message)
                return

        rank_cog = self.bot.get_cog("RankCog")
        if rank_cog is not None:
            await rank_cog.award_vica_response(
                message.guild.id, message.channel.id, response
            )

    def _format_message_prompt(self, message: discord.Message) -> str:
        username = message.author.name
        content = self._clean_message_content(message.content)
        return f"[meta|{username}|{message.author.id}]\n{username}: {content}"

    def _format_reaction_prompt(
        self,
        message: discord.Message,
        reaction_author: discord.User | discord.Member,
        reaction_emoji: str,
    ) -> str:
        reaction_username = reaction_author.name
        message_username = message.author.name
        content = self._clean_message_content(message.content)
        return (
            f"[meta|{reaction_username}|{reaction_author.id}]\n"
            f"{reaction_username} reagiu com {reaction_emoji} a uma mensagem de "
            f"{message_username}:\n{message_username}: {content}"
        )

    def _clean_message_content(self, content: str) -> str:
        if self.bot.user is not None:
            content = re.sub(rf"<@!?{self.bot.user.id}>", "", content)
        return content.strip() or "[mensagem sem texto]"

    async def _send_response(self, trigger: discord.Message, response: str) -> None:
        chunks = self._response_chunks(response)
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

    async def _send_interaction_response(
        self, interaction: discord.Interaction, response: str
    ) -> None:
        chunks = self._response_chunks(response)
        await interaction.edit_original_response(
            content=chunks[0],
            allowed_mentions=discord.AllowedMentions.none(),
        )
        for chunk in chunks[1:]:
            await interaction.followup.send(
                chunk,
                allowed_mentions=discord.AllowedMentions.none(),
            )

    async def _send_message_error(self, message: discord.Message) -> None:
        try:
            await message.reply(
                "Nao consegui responder agora. Tente novamente em alguns instantes.",
                mention_author=False,
                allowed_mentions=discord.AllowedMentions.none(),
            )
        except discord.HTTPException:
            pass

    @staticmethod
    def _response_chunks(response: str) -> list[str]:
        if not response.strip():
            raise ProviderError("LLM retornou resposta vazia")
        return [response[index : index + 2000] for index in range(0, len(response), 2000)]
