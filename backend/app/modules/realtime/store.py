from __future__ import annotations

from abc import ABC, abstractmethod
from collections import defaultdict
from datetime import datetime
from threading import RLock

import redis

from ...config import Settings


def user_sockets_key(user_id: str) -> str:
    return f"realtime:user:{user_id}:sockets"


def socket_user_key(socket_id: str) -> str:
    return f"realtime:socket:{socket_id}:user"


def user_online_key(user_id: str) -> str:
    return f"realtime:user:{user_id}:online"


def user_last_seen_key(user_id: str) -> str:
    return f"realtime:user:{user_id}:last_seen"


def user_unread_count_key(user_id: str) -> str:
    return f"realtime:user:{user_id}:notification_unread_count"


class RealtimeStore(ABC):
    @abstractmethod
    def add_socket(self, *, user_id: str, socket_id: str) -> None: ...

    @abstractmethod
    def remove_socket(self, socket_id: str, *, last_seen: datetime) -> str | None: ...

    @abstractmethod
    def is_user_online(self, user_id: str) -> bool: ...

    @abstractmethod
    def touch_user(self, *, user_id: str, last_seen: datetime) -> None: ...

    @abstractmethod
    def set_unread_count(self, *, user_id: str, unread_count: int) -> None: ...


class InMemoryRealtimeStore(RealtimeStore):
    def __init__(self) -> None:
        self._lock = RLock()
        self._user_sockets: dict[str, set[str]] = defaultdict(set)
        self._socket_user: dict[str, str] = {}
        self._last_seen: dict[str, str] = {}
        self._unread_count: dict[str, int] = {}

    def add_socket(self, *, user_id: str, socket_id: str) -> None:
        with self._lock:
            self._user_sockets[user_id].add(socket_id)
            self._socket_user[socket_id] = user_id

    def remove_socket(self, socket_id: str, *, last_seen: datetime) -> str | None:
        with self._lock:
            user_id = self._socket_user.pop(socket_id, None)
            if user_id is None:
                return None
            sockets = self._user_sockets.get(user_id)
            if sockets is not None:
                sockets.discard(socket_id)
                if not sockets:
                    self._user_sockets.pop(user_id, None)
            self._last_seen[user_id] = last_seen.isoformat()
            return user_id

    def is_user_online(self, user_id: str) -> bool:
        with self._lock:
            return bool(self._user_sockets.get(user_id))

    def touch_user(self, *, user_id: str, last_seen: datetime) -> None:
        with self._lock:
            self._last_seen[user_id] = last_seen.isoformat()

    def set_unread_count(self, *, user_id: str, unread_count: int) -> None:
        with self._lock:
            self._unread_count[user_id] = unread_count


class RedisRealtimeStore(RealtimeStore):
    def __init__(self, url: str) -> None:
        self._redis = redis.Redis.from_url(url, decode_responses=True)

    def add_socket(self, *, user_id: str, socket_id: str) -> None:
        pipeline = self._redis.pipeline()
        pipeline.sadd(user_sockets_key(user_id), socket_id)
        pipeline.set(socket_user_key(socket_id), user_id)
        pipeline.set(user_online_key(user_id), "1")
        pipeline.execute()

    def remove_socket(self, socket_id: str, *, last_seen: datetime) -> str | None:
        user_id = self._redis.get(socket_user_key(socket_id))
        if user_id is None:
            return None

        pipeline = self._redis.pipeline()
        pipeline.delete(socket_user_key(socket_id))
        pipeline.srem(user_sockets_key(user_id), socket_id)
        pipeline.set(user_last_seen_key(user_id), last_seen.isoformat())
        pipeline.execute()

        if self._redis.scard(user_sockets_key(user_id)) == 0:
            self._redis.delete(user_online_key(user_id))
        else:
            self._redis.set(user_online_key(user_id), "1")
        return user_id

    def is_user_online(self, user_id: str) -> bool:
        return self._redis.exists(user_online_key(user_id)) == 1

    def touch_user(self, *, user_id: str, last_seen: datetime) -> None:
        self._redis.set(user_last_seen_key(user_id), last_seen.isoformat())
        if self.is_user_online(user_id):
            self._redis.set(user_online_key(user_id), "1")

    def set_unread_count(self, *, user_id: str, unread_count: int) -> None:
        self._redis.set(user_unread_count_key(user_id), unread_count)


def build_realtime_store(settings: Settings) -> RealtimeStore:
    if settings.realtime_redis_url.startswith(("redis://", "rediss://")):
        return RedisRealtimeStore(settings.realtime_redis_url)
    return InMemoryRealtimeStore()
