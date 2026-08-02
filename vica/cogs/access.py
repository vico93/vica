"""Commands for managing NeoVica admins and moderators."""

from __future__ import annotations

import discord
from discord import app_commands
from discord.ext import commands

from ..db.access_repository import AccessRepository
from ..permissions import can_manage_moderators, interaction_member, subject_label


class AccessCog(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        self.repository = AccessRepository(bot.database)

    @app_commands.command(name="addadm", description="Adiciona um membro ou cargo como administrador da Vica.")
    @app_commands.describe(membro="Membro que sera administrador", cargo="Cargo que sera administrador")
    async def add_admin(
        self,
        interaction: discord.Interaction,
        membro: discord.Member | None = None,
        cargo: discord.Role | None = None,
    ) -> None:
        if not await self._owner_only(interaction):
            return
        subject = self._subject(membro, cargo)
        if subject is None:
            await self._error(interaction, "Informe exatamente um membro ou um cargo.")
            return
        await self.repository.add(interaction.guild.id, "admin", *subject)
        await interaction.response.send_message(
            f"{subject_label(*subject)} agora e administrador.", ephemeral=True
        )

    @app_commands.command(name="removeadm", description="Remove um membro ou cargo da lista de administradores.")
    @app_commands.describe(membro="Membro a remover", cargo="Cargo a remover")
    async def remove_admin(
        self,
        interaction: discord.Interaction,
        membro: discord.Member | None = None,
        cargo: discord.Role | None = None,
    ) -> None:
        if not await self._owner_only(interaction):
            return
        subject = self._subject(membro, cargo)
        if subject is None:
            await self._error(interaction, "Informe exatamente um membro ou um cargo.")
            return
        await self.repository.remove(interaction.guild.id, "admin", *subject)
        await interaction.response.send_message(
            f"{subject_label(*subject)} removido da lista de administradores.", ephemeral=True
        )

    @app_commands.command(name="listadms", description="Lista os administradores configurados da Vica.")
    async def list_admins(self, interaction: discord.Interaction) -> None:
        if not await self._owner_or_admin(interaction):
            return
        entries = await self.repository.list_entries(interaction.guild.id, "admin")
        await interaction.response.send_message(
            self._format_entries("Administradores", entries), ephemeral=True
        )

    @app_commands.command(name="addmod", description="Adiciona um membro ou cargo como moderador da Vica.")
    @app_commands.describe(membro="Membro que sera moderador", cargo="Cargo que sera moderador")
    async def add_mod(
        self,
        interaction: discord.Interaction,
        membro: discord.Member | None = None,
        cargo: discord.Role | None = None,
    ) -> None:
        if not await self._can_manage_moderators(interaction):
            return
        subject = self._subject(membro, cargo)
        if subject is None:
            await self._error(interaction, "Informe exatamente um membro ou um cargo.")
            return
        await self.repository.add(interaction.guild.id, "mod", *subject)
        await interaction.response.send_message(
            f"{subject_label(*subject)} agora e moderador.", ephemeral=True
        )

    @app_commands.command(name="removemod", description="Remove um membro ou cargo da lista de moderadores.")
    @app_commands.describe(membro="Membro a remover", cargo="Cargo a remover")
    async def remove_mod(
        self,
        interaction: discord.Interaction,
        membro: discord.Member | None = None,
        cargo: discord.Role | None = None,
    ) -> None:
        if not await self._can_manage_moderators(interaction):
            return
        subject = self._subject(membro, cargo)
        if subject is None:
            await self._error(interaction, "Informe exatamente um membro ou um cargo.")
            return
        await self.repository.remove(interaction.guild.id, "mod", *subject)
        await interaction.response.send_message(
            f"{subject_label(*subject)} removido da lista de moderadores.", ephemeral=True
        )

    @app_commands.command(name="listmods", description="Lista os moderadores configurados da Vica.")
    async def list_mods(self, interaction: discord.Interaction) -> None:
        if not await self._can_manage_moderators(interaction):
            return
        entries = await self.repository.list_entries(interaction.guild.id, "mod")
        await interaction.response.send_message(
            self._format_entries("Moderadores", entries), ephemeral=True
        )

    @staticmethod
    def _subject(
        membro: discord.Member | None, cargo: discord.Role | None
    ) -> tuple[str, int] | None:
        if (membro is None) == (cargo is None):
            return None
        if cargo is not None and cargo.is_default():
            return None
        if membro is not None and membro.bot:
            return None
        return ("member", membro.id) if membro is not None else ("role", cargo.id)

    async def _owner_only(self, interaction: discord.Interaction) -> bool:
        if interaction.guild is None or interaction.guild.owner_id != interaction.user.id:
            await self._error(interaction, "Somente o dono do servidor pode alterar administradores.")
            return False
        return True

    async def _owner_or_admin(self, interaction: discord.Interaction) -> bool:
        member = interaction_member(interaction)
        if member is None or interaction.guild is None:
            await self._error(interaction, "Use este comando dentro de um servidor.")
            return False
        if not await can_manage_moderators(interaction.guild, member, self.repository):
            await self._error(interaction, "Voce nao pode consultar os administradores.")
            return False
        return True

    async def _can_manage_moderators(self, interaction: discord.Interaction) -> bool:
        member = interaction_member(interaction)
        if member is None or interaction.guild is None:
            await self._error(interaction, "Use este comando dentro de um servidor.")
            return False
        if not await can_manage_moderators(interaction.guild, member, self.repository):
            await self._error(interaction, "Voce nao pode alterar moderadores.")
            return False
        return True

    @staticmethod
    def _format_entries(title: str, entries: list[tuple[str, int]]) -> str:
        if not entries:
            return f"**{title}**\nNenhum cadastro."
        lines = [f"**{title}**"]
        lines.extend(f"- {subject_label(subject_type, subject_id)}" for subject_type, subject_id in entries)
        return "\n".join(lines)

    @staticmethod
    async def _error(interaction: discord.Interaction, message: str) -> None:
        await interaction.response.send_message(message, ephemeral=True)
