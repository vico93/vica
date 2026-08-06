"""Application configuration loaded from a local JSON file."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class ConfigError(ValueError):
    """Raised when the application configuration is invalid."""


@dataclass(frozen=True)
class DiscordConfig:
    token: str
    application_id: int | None


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    base_url: str
    api_key: str
    model: str
    send_system_prompt: bool
    headers: dict[str, str]
    timeout_seconds: float
    retry_attempts: int


@dataclass(frozen=True)
class LLMConfig:
    system_prompt: str
    providers: tuple[ProviderConfig, ...]


@dataclass(frozen=True)
class ChatbotConfig:
    respond_to_everyone: bool


@dataclass(frozen=True)
class AttachmentsConfig:
    max_per_message: int


@dataclass(frozen=True)
class DatabaseConfig:
    path: Path


@dataclass(frozen=True)
class LoggingConfig:
    level: str
    file: Path
    max_bytes: int
    backup_count: int


@dataclass(frozen=True)
class RankConfig:
    message_min_length: int
    message_min_simplified_length: int
    message_max_xp: int
    voice_xp_per_minute: int
    voice_interval_seconds: int
    vica_multiplier: float


@dataclass(frozen=True)
class AppConfig:
    discord: DiscordConfig
    llm: LLMConfig
    chatbot: ChatbotConfig
    attachments: AttachmentsConfig
    database: DatabaseConfig
    logging: LoggingConfig
    rank: RankConfig
    config_path: Path


def _mapping(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ConfigError(f"A secao '{name}' precisa ser um objeto JSON.")
    return value


def _string(section: dict[str, Any], key: str, section_name: str) -> str:
    value = section.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"'{section_name}.{key}' precisa ser um texto nao vazio.")
    return value.strip()


def _headers(section: dict[str, Any], key: str, section_name: str) -> dict[str, str]:
    value = section.get(key, {})
    if not isinstance(value, dict):
        raise ConfigError(f"'{section_name}.{key}' precisa ser um objeto JSON.")

    headers: dict[str, str] = {}
    normalized_names: set[str] = set()
    for header_name, header_value in value.items():
        if not isinstance(header_name, str) or not header_name.strip():
            raise ConfigError(f"'{section_name}.{key}' possui um nome de header invalido.")
        if not isinstance(header_value, str):
            raise ConfigError(
                f"'{section_name}.{key}.{header_name}' precisa ser um texto."
            )
        clean_name = header_name.strip()
        clean_value = header_value.strip()
        normalized_name = clean_name.lower()
        if normalized_name in normalized_names:
            raise ConfigError(
                f"'{section_name}.{key}' possui headers duplicados sem diferenca de maiusculas."
            )
        if not clean_value:
            raise ConfigError(f"'{section_name}.{key}.{header_name}' nao pode ser vazio.")
        normalized_names.add(normalized_name)
        headers[clean_name] = clean_value
    return headers


def _optional_id(section: dict[str, Any], key: str, section_name: str) -> int | None:
    value = section.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ConfigError(f"'{section_name}.{key}' precisa ser um ID inteiro positivo ou null.")
    return value


def _boolean(section: dict[str, Any], key: str, section_name: str, default: bool) -> bool:
    value = section.get(key, default)
    if not isinstance(value, bool):
        raise ConfigError(f"'{section_name}.{key}' precisa ser true ou false.")
    return value


def _positive_int(
    section: dict[str, Any], key: str, section_name: str, default: int
) -> int:
    value = section.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ConfigError(f"'{section_name}.{key}' precisa ser um inteiro positivo.")
    return value


def _non_negative_int(
    section: dict[str, Any], key: str, section_name: str, default: int
) -> int:
    value = section.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ConfigError(f"'{section_name}.{key}' precisa ser um inteiro nao negativo.")
    return value


def _positive_float(
    section: dict[str, Any], key: str, section_name: str, default: float
) -> float:
    value = section.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        raise ConfigError(f"'{section_name}.{key}' precisa ser um numero positivo.")
    return float(value)


def _resolve_path(value: str, config_path: Path) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = config_path.parent / path
    return path


async def load_config(path: str | Path = "config.json") -> AppConfig:
    """Load and validate configuration without blocking the event loop."""

    config_path = Path(path).expanduser().resolve()
    if not await asyncio.to_thread(config_path.is_file):
        raise ConfigError(
            f"Arquivo de configuracao nao encontrado: {config_path}. "
            "Copie config.example.json para config.json e preencha os segredos."
        )

    try:
        raw = json.loads(await asyncio.to_thread(config_path.read_text, encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ConfigError(f"JSON invalido em {config_path}: {exc.msg}.") from exc

    root = _mapping(raw, "raiz")
    discord = _mapping(root.get("discord"), "discord")
    llm = _mapping(root.get("llm"), "llm")
    chatbot = _mapping(root.get("chatbot", {}), "chatbot")
    attachments = _mapping(root.get("attachments", {}), "attachments")
    database = _mapping(root.get("database"), "database")
    logging_config = _mapping(root.get("logging"), "logging")
    rank = _mapping(root.get("rank", {}), "rank")

    providers_raw = llm.get("providers")
    if not isinstance(providers_raw, list) or not providers_raw:
        raise ConfigError("'llm.providers' precisa ser uma lista com pelo menos um provedor.")

    providers: list[ProviderConfig] = []
    provider_names: set[str] = set()
    for index, provider_raw in enumerate(providers_raw):
        provider = _mapping(provider_raw, f"llm.providers[{index}]")
        name = _string(provider, "name", f"llm.providers[{index}]")
        if name in provider_names:
            raise ConfigError(f"Nome de provedor duplicado: {name}.")
        provider_names.add(name)
        providers.append(
            ProviderConfig(
                name=name,
                base_url=_string(provider, "base_url", f"llm.providers[{index}]").rstrip("/"),
                api_key=_string(provider, "api_key", f"llm.providers[{index}]"),
                model=_string(provider, "model", f"llm.providers[{index}]"),
                send_system_prompt=_boolean(
                    provider, "send_system_prompt", f"llm.providers[{index}]", True
                ),
                headers=_headers(provider, "headers", f"llm.providers[{index}]"),
                timeout_seconds=_positive_float(
                    provider, "timeout_seconds", f"llm.providers[{index}]", 90.0
                ),
                retry_attempts=_non_negative_int(
                    provider, "retry_attempts", f"llm.providers[{index}]", 2
                ),
            )
        )

    discord_config = DiscordConfig(
        token=_string(discord, "token", "discord"),
        application_id=_optional_id(discord, "application_id", "discord"),
    )
    system_prompt = ""
    if any(provider.send_system_prompt for provider in providers):
        prompt_path = config_path.parent / "system_prompt.txt"
        if not await asyncio.to_thread(prompt_path.is_file):
            raise ConfigError(
                f"Arquivo de prompt nao encontrado: {prompt_path}. "
                "Copie system_prompt.example.txt para system_prompt.txt."
            )
        try:
            system_prompt = await asyncio.to_thread(prompt_path.read_text, encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            raise ConfigError(f"Nao foi possivel ler {prompt_path}: {exc}.") from exc
        if not system_prompt.strip():
            raise ConfigError(f"O arquivo de prompt esta vazio: {prompt_path}.")

    llm_config = LLMConfig(
        system_prompt=system_prompt,
        providers=tuple(providers),
    )
    chatbot_config = ChatbotConfig(
        respond_to_everyone=_boolean(
            chatbot, "respond_to_everyone", "chatbot", False
        )
    )
    attachments_config = AttachmentsConfig(
        max_per_message=_positive_int(
            attachments, "max_per_message", "attachments", 10
        )
    )
    database_config = DatabaseConfig(
        path=_resolve_path(_string(database, "path", "database"), config_path)
    )
    logging_level = _string(logging_config, "level", "logging").upper()
    if logging_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        raise ConfigError("'logging.level' precisa ser DEBUG, INFO, WARNING, ERROR ou CRITICAL.")
    logging_config_value = LoggingConfig(
        level=logging_level,
        file=_resolve_path(_string(logging_config, "file", "logging"), config_path),
        max_bytes=_positive_int(logging_config, "max_bytes", "logging", 10 * 1024 * 1024),
        backup_count=_positive_int(logging_config, "backup_count", "logging", 5),
    )
    rank_config = RankConfig(
        message_min_length=_positive_int(rank, "message_min_length", "rank", 5),
        message_min_simplified_length=_positive_int(
            rank, "message_min_simplified_length", "rank", 12
        ),
        message_max_xp=_positive_int(rank, "message_max_xp", "rank", 35),
        voice_xp_per_minute=_non_negative_int(rank, "voice_xp_per_minute", "rank", 1),
        voice_interval_seconds=_positive_int(rank, "voice_interval_seconds", "rank", 60),
        vica_multiplier=_positive_float(rank, "vica_multiplier", "rank", 1.0),
    )

    return AppConfig(
        discord=discord_config,
        llm=llm_config,
        chatbot=chatbot_config,
        attachments=attachments_config,
        database=database_config,
        logging=logging_config_value,
        rank=rank_config,
        config_path=config_path,
    )
