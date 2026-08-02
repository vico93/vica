"""Delete NeoVica slash commands globally, for one guild, or both."""

from __future__ import annotations

import argparse
import asyncio

import discord

from vica.deployment import create_deployment_bot


def discord_id(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("o ID precisa ser um numero inteiro") from exc
    if parsed <= 0:
        raise argparse.ArgumentTypeError("o ID precisa ser positivo")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Remove slash commands da NeoVica no Discord."
    )
    parser.add_argument(
        "--global",
        dest="global_commands",
        action="store_true",
        help="remove os comandos globais",
    )
    parser.add_argument(
        "--guild",
        type=discord_id,
        help="remove os comandos da guild informada",
    )
    args = parser.parse_args()
    if not args.global_commands and args.guild is None:
        parser.error("informe --global, --guild ou ambos")
    return args


async def run(global_commands: bool, guild_id: int | None) -> None:
    bot = await create_deployment_bot()
    try:
        if global_commands:
            print("[NEOVICA][DELETE] Removendo comandos globais...")
            bot.tree.clear_commands(guild=None)
            await bot.tree.sync()
            print("[NEOVICA][DELETE] Comandos globais removidos.")

        if guild_id is not None:
            print(f"[NEOVICA][DELETE] Removendo comandos da guild {guild_id}...")
            guild = discord.Object(id=guild_id)
            bot.tree.clear_commands(guild=guild)
            await bot.tree.sync(guild=guild)
            print("[NEOVICA][DELETE] Comandos da guild removidos.")
    finally:
        await bot.close()


def main() -> int:
    args = parse_args()
    try:
        asyncio.run(run(args.global_commands, args.guild))
    except Exception as exc:
        print(f"[NEOVICA][DELETE] Erro: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
