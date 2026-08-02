"""Per-guild authorization helpers for configuration commands."""

from __future__ import annotations

import discord

from .db.access_repository import AccessRepository


async def is_admin(
    guild: discord.Guild, member: discord.Member, repository: AccessRepository
) -> bool:
    if guild.owner_id == member.id:
        return True
    return await repository.has_access(
        guild.id, "admin", member.id, (role.id for role in member.roles)
    )


async def can_manage_config(
    guild: discord.Guild, member: discord.Member, repository: AccessRepository
) -> bool:
    if await is_admin(guild, member, repository):
        return True
    return await repository.has_access(
        guild.id, "mod", member.id, (role.id for role in member.roles)
    )


async def can_manage_moderators(
    guild: discord.Guild, member: discord.Member, repository: AccessRepository
) -> bool:
    return await is_admin(guild, member, repository)


def interaction_member(interaction: discord.Interaction) -> discord.Member | None:
    if interaction.guild is None or not isinstance(interaction.user, discord.Member):
        return None
    return interaction.user


def subject_label(subject_type: str, subject_id: int) -> str:
    if subject_type == "role":
        return f"cargo <@&{subject_id}>"
    return f"membro <@{subject_id}>"
