"""Responses API client with provider fallback and native context IDs."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import aiohttp

from ..config import LLMConfig, ProviderConfig
from ..db.chat_repository import ChatRepository

logger = logging.getLogger(__name__)


class ProviderError(RuntimeError):
    """An upstream provider could not produce a response."""

    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


class ResponsesProvider:
    def __init__(self, config: ProviderConfig, system_prompt: str) -> None:
        self.config = config
        self.system_prompt = system_prompt

    @property
    def endpoint(self) -> str:
        return f"{self.config.base_url}/responses"

    async def request(
        self,
        session: aiohttp.ClientSession,
        input_content: str | list[dict[str, Any]],
        previous_response_id: str | None,
    ) -> tuple[str, str]:
        payload: dict[str, Any] = {
            "model": self.config.model,
            "input": input_content,
        }
        if self.config.send_system_prompt and self.system_prompt:
            payload["instructions"] = self.system_prompt
        if previous_response_id:
            payload["previous_response_id"] = previous_response_id

        headers = {
            **self.config.headers,
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }
        attempts = self.config.retry_attempts + 1
        last_error: Exception | None = None
        for attempt in range(attempts):
            try:
                timeout = aiohttp.ClientTimeout(total=self.config.timeout_seconds)
                async with session.post(
                    self.endpoint, json=payload, headers=headers, timeout=timeout
                ) as response:
                    data = await response.json(content_type=None)
                    if response.status >= 400:
                        message = _error_message(data, response.status)
                        if response.status in {408, 429, 500, 502, 503, 504} and attempt + 1 < attempts:
                            await asyncio.sleep(min(2**attempt, 8))
                            continue
                        raise ProviderError(
                            f"provedor {self.config.name}: {message}",
                            retryable=response.status in {408, 429, 500, 502, 503, 504},
                        )
                    return _extract_response(data, self.config.name)
            except (aiohttp.ClientError, asyncio.TimeoutError, ProviderError) as exc:
                last_error = exc
                if isinstance(exc, ProviderError) and not exc.retryable:
                    break
                if attempt + 1 < attempts:
                    await asyncio.sleep(min(2**attempt, 8))
                    continue
                break
        raise ProviderError(f"provedor {self.config.name} falhou: {last_error}") from last_error


class ResponsesProviderManager:
    """Try configured Responses API providers in order, sticking to successes."""

    def __init__(self, config: LLMConfig, chat_repository: ChatRepository) -> None:
        self.providers = [
            ResponsesProvider(provider, config.system_prompt)
            for provider in config.providers
        ]
        self.chat_repository = chat_repository
        self.session: aiohttp.ClientSession | None = None
        self._preferred_index = 0
        self._preference_lock = asyncio.Lock()

    async def start(self) -> None:
        if self.session is None:
            self.session = aiohttp.ClientSession()

    async def respond(
        self, channel_id: int, input_content: str | list[dict[str, Any]]
    ) -> str:
        await self.start()
        assert self.session is not None
        async with self._preference_lock:
            start_index = self._preferred_index

        for offset in range(len(self.providers)):
            index = (start_index + offset) % len(self.providers)
            provider = self.providers[index]
            previous_response_id = await self.chat_repository.get_context(
                channel_id, provider.config.name
            )
            try:
                text, response_id = await provider.request(
                    self.session, input_content, previous_response_id
                )
            except ProviderError as exc:
                logger.warning("Falha no provedor %s: %s", provider.config.name, exc)
                continue
            await self.chat_repository.save_context(channel_id, provider.config.name, response_id)
            async with self._preference_lock:
                self._preferred_index = index
            return text

        raise ProviderError("Todos os provedores de LLM configurados falharam.")

    async def close(self) -> None:
        if self.session is not None:
            await self.session.close()
            self.session = None


def _error_message(data: Any, status: int) -> str:
    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict) and error.get("message"):
            return f"HTTP {status}: {error['message']}"
        if data.get("message"):
            return f"HTTP {status}: {data['message']}"
    return f"HTTP {status}"


def _extract_response(data: Any, provider_name: str) -> tuple[str, str]:
    if not isinstance(data, dict):
        raise ProviderError(f"provedor {provider_name} retornou JSON inesperado")
    response_id = data.get("id")
    if not isinstance(response_id, str) or not response_id:
        raise ProviderError(f"provedor {provider_name} nao retornou um ID de resposta")

    output_text = data.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip(), response_id

    parts: list[str] = []
    output = data.get("output", [])
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content", [])
            if not isinstance(content, list):
                continue
            for content_item in content:
                if not isinstance(content_item, dict):
                    continue
                if content_item.get("type") not in {"output_text", "text"}:
                    continue
                text = content_item.get("text")
                if isinstance(text, str):
                    parts.append(text)
    text = "".join(parts).strip()
    if not text:
        raise ProviderError(f"provedor {provider_name} retornou uma resposta sem texto")
    return text, response_id
