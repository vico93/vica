"""EXP tracking and ranking commands."""

from __future__ import annotations

import logging
import math
import random
import re
import time
from collections.abc import Callable
from datetime import datetime

import discord
from discord import app_commands
from discord.ext import commands, tasks

from ..config import AppConfig
from ..db.access_repository import AccessRepository
from ..db.config_repository import ConfigRepository
from ..db.rank_repository import RankRepository
from ..permissions import can_manage_config, interaction_member

logger = logging.getLogger(__name__)


def collapse_repeated_characters(text: str) -> str:
    return re.sub(r"(.)\1+", r"\1", text, flags=re.DOTALL)


def calculate_text_xp(
    content: str,
    minimum_length: int,
    minimum_simplified_length: int,
    maximum_xp: int,
    *,
    previous: tuple[str, float] | None = None,
    now: float | None = None,
    check_human_timing: bool = True,
    random_int: Callable[[int, int], int] = random.randint,
) -> int | None:
    """Calculate XP using the message rules documented from Loritta's FAQ."""

    if len(content) <= minimum_length:
        return None
    if previous is not None:
        previous_content, previous_time = previous
        if content == previous_content:
            return None
        if check_human_timing:
            current_time = time.monotonic() if now is None else now
            if current_time - previous_time < len(content) / 7:
                return None

    simplified_length = len(collapse_repeated_characters(content))
    if simplified_length <= minimum_simplified_length:
        return None

    minimum_xp = max(1, simplified_length // 7)
    maximum_roll = min(maximum_xp, max(1, simplified_length // 4))
    if minimum_xp > maximum_roll:
        minimum_xp = maximum_roll
    return random_int(minimum_xp, maximum_roll)


def apply_multiplier(amount: int, multiplier: float) -> int:
    if amount <= 0 or multiplier <= 0:
        return 0
    return max(0, int(round(amount * multiplier)))


def rank_thread_name() -> str:
    now = datetime.now()
    return f"Rank {now.day:02d}/{now.month:02d}"


class RankCog(commands.Cog):
    def __init__(
        self, bot: commands.Bot, config: AppConfig, start_background_tasks: bool = True
    ) -> None:
        self.bot = bot
        self.config = config
        self.start_background_tasks = start_background_tasks
        database = bot.database
        self.rank_repository = RankRepository(database)
        self.config_repository = ConfigRepository(database)
        self.access_repository = AccessRepository(database)
        self._last_messages: dict[tuple[int, int], tuple[str, float]] = {}
        self.voice_loop = tasks.loop(seconds=config.rank.voice_interval_seconds)(
            self._voice_tick
        )

    async def cog_load(self) -> None:
        if self.start_background_tasks:
            self.voice_loop.start()

    def cog_unload(self) -> None:
        if self.voice_loop.is_running():
            self.voice_loop.cancel()

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        if message.guild is None or message.author.bot:
            return
        if await self.rank_repository.is_blacklisted(message.guild.id, message.channel.id):
            return

        now = time.monotonic()
        key = (message.guild.id, message.author.id)
        previous = self._last_messages.get(key)
        self._last_messages[key] = (message.content, now)
        base_xp = calculate_text_xp(
            message.content,
            self.config.rank.message_min_length,
            self.config.rank.message_min_simplified_length,
            self.config.rank.message_max_xp,
            previous=previous,
            now=now,
        )
        if base_xp is None:
            return

        role_multipliers = await self.rank_repository.get_role_multipliers(message.guild.id)
        configured_multipliers = [
            role_multipliers[role.id] for role in message.author.roles if role.id in role_multipliers
        ]
        multiplier = max(configured_multipliers, default=1.0)
        await self.rank_repository.add_experience(
            message.guild.id, message.author.id, apply_multiplier(base_xp, multiplier)
        )

    @app_commands.command(name="rank", description="Mostra o top 10 de EXP do servidor.")
    @app_commands.describe(
        mencionar="Membro, cargo ou @everyone para mencionar junto do ranking",
        cria_topico="Cria um tópico na mensagem do ranking",
    )
    async def rank_command(
        self,
        interaction: discord.Interaction,
        mencionar: discord.Member | discord.Role | None = None,
        cria_topico: bool = False,
    ) -> None:
        if interaction.guild is None:
            await interaction.response.send_message(
                "Este comando so pode ser usado dentro de um servidor.", ephemeral=True
            )
            return
        entries = await self.rank_repository.top_experience(interaction.guild.id)
        embed = discord.Embed(
            title="Pódio",
            color=discord.Color(0x23650B),
        )
        embed.set_author(name=f"RANKING - {interaction.guild.name}")
        if not entries:
            embed.description = "Ainda nao ha EXP registrada neste servidor."
        else:
            podium_emojis = ("🥇", "🥈", "🥉", "🏅")
            podium_lines = [
                f"{podium_emojis[position]} <@{user_id}> ・ **{xp:,} XP**".replace(",", ".")
                for position, (user_id, xp) in enumerate(entries[:4])
            ]
            embed.description = "\n".join(podium_lines)

            if len(entries) > 4:
                remaining_lines = [
                    f"🎖️ <@{user_id}> ・ **{xp:,} XP**".replace(",", ".")
                    for user_id, xp in entries[4:]
                ]
                embed.add_field(
                    name="…também figuram…",
                    value="\n".join(remaining_lines),
                    inline=False,
                )

        content = None
        allowed_mentions = discord.AllowedMentions.none()
        if mencionar is not None:
            if isinstance(mencionar, discord.Role) and mencionar.is_default():
                content = "@everyone"
                allowed_mentions = discord.AllowedMentions(everyone=True)
            elif isinstance(mencionar, discord.Member):
                content = mencionar.mention
                allowed_mentions = discord.AllowedMentions(users=True)
            else:
                content = mencionar.mention
                allowed_mentions = discord.AllowedMentions(roles=True)

        mention_in_thread = cria_topico and mencionar is not None
        await interaction.response.send_message(
            content=None if mention_in_thread else content,
            embed=embed,
            allowed_mentions=allowed_mentions,
        )

        if cria_topico:
            ranking_message = await interaction.original_response()
            if isinstance(ranking_message.channel, discord.TextChannel):
                try:
                    thread = await ranking_message.create_thread(
                        name=rank_thread_name(), auto_archive_duration=1440
                    )
                    if mention_in_thread:
                        await thread.send(
                            content=content,
                            allowed_mentions=allowed_mentions,
                        )
                except discord.Forbidden:
                    logger.warning(
                        "Sem permissao para criar topico ou enviar a mencao no ranking"
                    )
                except Exception:
                    logger.exception("Nao foi possivel criar topico para o ranking")
            else:
                logger.warning("Canal nao suporta topicos para o ranking")

    @app_commands.command(
        name="rank-multiplicador",
        description="Define o multiplicador de EXP de um cargo.",
    )
    @app_commands.describe(cargo="Cargo que recebera o multiplicador", multiplicador="Ex.: 1.5")
    async def set_role_multiplier(
        self, interaction: discord.Interaction, cargo: discord.Role, multiplicador: float
    ) -> None:
        member = interaction_member(interaction)
        if member is None or interaction.guild is None:
            await self._configuration_error(interaction, "Use este comando dentro de um servidor.")
            return
        if not await can_manage_config(interaction.guild, member, self.access_repository):
            await self._configuration_error(interaction, "Voce nao pode alterar configuracoes.")
            return
        if not math.isfinite(multiplicador) or multiplicador < 0 or multiplicador > 100:
            await self._configuration_error(
                interaction, "O multiplicador precisa estar entre 0 e 100."
            )
            return
        await self.rank_repository.set_role_multiplier(
            interaction.guild.id, cargo.id, multiplicador
        )
        await interaction.response.send_message(
            f"Multiplicador de {cargo.mention} definido como `{multiplicador:g}x`.",
            ephemeral=True,
        )

    @app_commands.command(
        name="rank-remover-multiplicador",
        description="Remove o multiplicador de EXP de um cargo.",
    )
    @app_commands.describe(cargo="Cargo que deixara de ter multiplicador proprio")
    async def remove_role_multiplier(
        self, interaction: discord.Interaction, cargo: discord.Role
    ) -> None:
        member = interaction_member(interaction)
        if member is None or interaction.guild is None:
            await self._configuration_error(interaction, "Use este comando dentro de um servidor.")
            return
        if not await can_manage_config(interaction.guild, member, self.access_repository):
            await self._configuration_error(interaction, "Voce nao pode alterar configuracoes.")
            return
        await self.rank_repository.remove_role_multiplier(interaction.guild.id, cargo.id)
        await interaction.response.send_message(
            f"Multiplicador proprio de {cargo.mention} removido.", ephemeral=True
        )

    @app_commands.command(
        name="rank-blacklist-add",
        description="Coloca um canal na lista negra de EXP.",
    )
    @app_commands.describe(canal="Canal de texto ou voz que nao dara EXP")
    async def blacklist_add(
        self, interaction: discord.Interaction, canal: discord.abc.GuildChannel
    ) -> None:
        if not await self._can_configure(interaction):
            return
        assert interaction.guild is not None
        if not isinstance(canal, (discord.TextChannel, discord.VoiceChannel, discord.StageChannel)):
            await self._configuration_error(
                interaction, "Escolha um canal de texto ou voz, nao uma categoria."
            )
            return
        await self.rank_repository.add_blacklisted_channel(interaction.guild.id, canal.id)
        await interaction.response.send_message(
            f"{canal.mention} adicionado a lista negra de EXP.", ephemeral=True
        )

    @app_commands.command(
        name="rank-blacklist-remove",
        description="Remove um canal da lista negra de EXP.",
    )
    @app_commands.describe(canal="Canal a liberar para EXP")
    async def blacklist_remove(
        self, interaction: discord.Interaction, canal: discord.abc.GuildChannel
    ) -> None:
        if not await self._can_configure(interaction):
            return
        assert interaction.guild is not None
        await self.rank_repository.remove_blacklisted_channel(interaction.guild.id, canal.id)
        await interaction.response.send_message(
            f"{canal.mention} removido da lista negra de EXP.", ephemeral=True
        )

    @app_commands.command(
        name="rank-blacklist-list",
        description="Lista os canais que nao geram EXP.",
    )
    async def blacklist_list(self, interaction: discord.Interaction) -> None:
        if not await self._can_configure(interaction):
            return
        assert interaction.guild is not None
        channel_ids = await self.rank_repository.blacklisted_channels(interaction.guild.id)
        if not channel_ids:
            text = "Nenhum canal esta na lista negra."
        else:
            text = "\n".join(f"<#{channel_id}> (`{channel_id}`)" for channel_id in channel_ids)
        await interaction.response.send_message(text, ephemeral=True)

    async def award_vica_response(self, guild_id: int, channel_id: int, content: str) -> None:
        if await self.rank_repository.is_blacklisted(guild_id, channel_id):
            return
        base_xp = calculate_text_xp(
            content,
            self.config.rank.message_min_length,
            self.config.rank.message_min_simplified_length,
            self.config.rank.message_max_xp,
            check_human_timing=False,
        )
        if base_xp is None:
            return
        default_multiplier = await self.config_repository.get_vica_multiplier(
            guild_id, self.config.rank.vica_multiplier
        )
        amount = apply_multiplier(base_xp, default_multiplier)
        if self.bot.user is not None:
            await self.rank_repository.add_experience(guild_id, self.bot.user.id, amount)

    async def _voice_tick(self) -> None:
        try:
            for guild in self.bot.guilds:
                blacklisted = await self.rank_repository.blacklisted_channels(guild.id)
                role_multipliers = await self.rank_repository.get_role_multipliers(guild.id)
                for channel in guild.channels:
                    if not isinstance(channel, (discord.VoiceChannel, discord.StageChannel)):
                        continue
                    if channel.id in blacklisted:
                        continue
                    humans = [member for member in channel.members if not member.bot]
                    if len(humans) < 2:
                        continue
                    for member in humans:
                        configured_multipliers = [
                            role_multipliers[role.id]
                            for role in member.roles
                            if role.id in role_multipliers
                        ]
                        multiplier = max(configured_multipliers, default=1.0)
                        amount = apply_multiplier(
                            self.config.rank.voice_xp_per_minute, multiplier
                        )
                        await self.rank_repository.add_experience(guild.id, member.id, amount)
        except Exception:
            logger.exception("Erro ao contabilizar EXP de voz")

    async def _can_configure(self, interaction: discord.Interaction) -> bool:
        member = interaction_member(interaction)
        if member is None or interaction.guild is None:
            await self._configuration_error(interaction, "Use este comando dentro de um servidor.")
            return False
        if not await can_manage_config(interaction.guild, member, self.access_repository):
            await self._configuration_error(interaction, "Voce nao pode alterar configuracoes.")
            return False
        return True

    @staticmethod
    async def _configuration_error(interaction: discord.Interaction, message: str) -> None:
        await interaction.response.send_message(message, ephemeral=True)
