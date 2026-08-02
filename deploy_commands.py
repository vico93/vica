"""Deploy NeoVica slash commands globally or to one Discord guild."""

from __future__ import annotations

import argparse
import asyncio

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
        description="Sincroniza os slash commands da NeoVica com o Discord."
    )
    parser.add_argument(
        "--guild",
        type=discord_id,
        help="ID da guild; sem esta opcao, o deploy sera global.",
    )
    return parser.parse_args()


async def run(guild_id: int | None) -> None:
    bot = await create_deployment_bot()
    try:
        if guild_id is None:
            print("[NEOVICA][DEPLOY] Enviando comandos GLOBALMENTE")
            synced = await bot.sync_commands()
            print(f"[NEOVICA][DEPLOY] {len(synced)} comandos enviados com sucesso.")
            print(
                "[NEOVICA][DEPLOY] Comandos globais podem levar ate 1 hora para aparecer."
            )
        else:
            print(f"[NEOVICA][DEPLOY] Enviando comandos para guild {guild_id}")
            synced = await bot.sync_commands(guild_id)
            print(f"[NEOVICA][DEPLOY] {len(synced)} comandos enviados com sucesso.")
    finally:
        await bot.close()


def main() -> int:
    args = parse_args()
    try:
        asyncio.run(run(args.guild))
    except Exception as exc:
        print(f"[NEOVICA][DEPLOY] Erro: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
