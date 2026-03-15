from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from threading import RLock
from time import monotonic

import redis

from ...config import Settings, get_settings

logger = logging.getLogger(__name__)


def ticket_summary_key(ticket_id: int) -> str:
    return f"ticket:summary:{ticket_id}"


def ticket_detail_base_key(ticket_id: int) -> str:
    return f"ticket:detail_base:{ticket_id}"


class TicketCacheBackend(ABC):
    @abstractmethod
    def get_json(self, key: str) -> dict[str, object] | None: ...

    @abstractmethod
    def set_json(self, key: str, value: dict[str, object], *, ttl_seconds: int) -> None: ...

    @abstractmethod
    def delete_many(self, keys: list[str]) -> None: ...

    def get_summary(self, ticket_id: int) -> dict[str, object] | None:
        return self.get_json(ticket_summary_key(ticket_id))

    def set_summary(
        self, ticket_id: int, value: dict[str, object], *, ttl_seconds: int
    ) -> None:
        self.set_json(ticket_summary_key(ticket_id), value, ttl_seconds=ttl_seconds)

    def get_detail_base(self, ticket_id: int) -> dict[str, object] | None:
        return self.get_json(ticket_detail_base_key(ticket_id))

    def set_detail_base(
        self, ticket_id: int, value: dict[str, object], *, ttl_seconds: int
    ) -> None:
        self.set_json(ticket_detail_base_key(ticket_id), value, ttl_seconds=ttl_seconds)

    def invalidate_ticket(self, ticket_id: int) -> None:
        self.delete_many(
            [ticket_summary_key(ticket_id), ticket_detail_base_key(ticket_id)]
        )


class DisabledTicketCacheBackend(TicketCacheBackend):
    def get_json(self, key: str) -> dict[str, object] | None:
        del key
        return None

    def set_json(self, key: str, value: dict[str, object], *, ttl_seconds: int) -> None:
        del key, value, ttl_seconds

    def delete_many(self, keys: list[str]) -> None:
        del keys


class InMemoryTicketCacheBackend(TicketCacheBackend):
    def __init__(self) -> None:
        self._lock = RLock()
        self._entries: dict[str, tuple[float, str]] = {}

    def get_json(self, key: str) -> dict[str, object] | None:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            expires_at, payload = entry
            if monotonic() >= expires_at:
                self._entries.pop(key, None)
                return None
        return json.loads(payload)

    def set_json(self, key: str, value: dict[str, object], *, ttl_seconds: int) -> None:
        payload = json.dumps(value, ensure_ascii=True, separators=(",", ":"))
        with self._lock:
            self._entries[key] = (monotonic() + ttl_seconds, payload)

    def delete_many(self, keys: list[str]) -> None:
        with self._lock:
            for key in keys:
                self._entries.pop(key, None)


class RedisTicketCacheBackend(TicketCacheBackend):
    def __init__(self, url: str) -> None:
        self._redis = redis.Redis.from_url(url, decode_responses=True)

    def get_json(self, key: str) -> dict[str, object] | None:
        try:
            payload = self._redis.get(key)
        except redis.RedisError:
            logger.exception("Failed to read ticket cache", extra={"key": key})
            return None
        if payload is None:
            return None
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            logger.exception("Failed to decode ticket cache payload", extra={"key": key})
            return None

    def set_json(self, key: str, value: dict[str, object], *, ttl_seconds: int) -> None:
        payload = json.dumps(value, ensure_ascii=True, separators=(",", ":"))
        try:
            self._redis.setex(key, ttl_seconds, payload)
        except redis.RedisError:
            logger.exception("Failed to write ticket cache", extra={"key": key})

    def delete_many(self, keys: list[str]) -> None:
        if not keys:
            return
        try:
            self._redis.delete(*keys)
        except redis.RedisError:
            logger.exception("Failed to delete ticket cache keys", extra={"keys": keys})


_ticket_cache_backend: TicketCacheBackend | None = None
_ticket_cache_ttl_seconds: int | None = None


def build_ticket_cache(settings: Settings) -> TicketCacheBackend:
    redis_url = settings.ticket_cache_redis_url or settings.realtime_redis_url
    if redis_url.startswith(("redis://", "rediss://")):
        return RedisTicketCacheBackend(redis_url)
    return DisabledTicketCacheBackend()


def configure_ticket_cache(settings: Settings | None = None) -> TicketCacheBackend:
    global _ticket_cache_backend
    global _ticket_cache_ttl_seconds
    resolved_settings = settings or get_settings()
    _ticket_cache_backend = build_ticket_cache(resolved_settings)
    _ticket_cache_ttl_seconds = resolved_settings.ticket_cache_ttl_seconds
    return _ticket_cache_backend


def get_ticket_cache() -> TicketCacheBackend:
    global _ticket_cache_backend
    if _ticket_cache_backend is None:
        _ticket_cache_backend = configure_ticket_cache()
    return _ticket_cache_backend


def get_ticket_cache_ttl_seconds() -> int:
    global _ticket_cache_ttl_seconds
    if _ticket_cache_ttl_seconds is None:
        configure_ticket_cache()
    return _ticket_cache_ttl_seconds or get_settings().ticket_cache_ttl_seconds


def set_ticket_cache_backend(backend: TicketCacheBackend) -> None:
    global _ticket_cache_backend
    global _ticket_cache_ttl_seconds
    _ticket_cache_backend = backend
    if _ticket_cache_ttl_seconds is None:
        _ticket_cache_ttl_seconds = get_settings().ticket_cache_ttl_seconds


def reset_ticket_cache_backend() -> None:
    global _ticket_cache_backend
    global _ticket_cache_ttl_seconds
    _ticket_cache_backend = None
    _ticket_cache_ttl_seconds = None
