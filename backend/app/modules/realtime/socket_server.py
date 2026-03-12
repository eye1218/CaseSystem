from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

import socketio
from sqlalchemy.orm import Session

from ...auth import AuthService
from ...config import Settings, get_settings
from ...database import SessionLocal
from ...enums import RoleCode
from ...security import utcnow
from .service import (
    acknowledge_notification,
    build_notification_message,
    build_notification_update_message,
    get_pending_notifications,
)
from .store import RealtimeStore, build_realtime_store

logger = logging.getLogger(__name__)

SessionFactory = Callable[[], Session]


def _normalize_socket_path(path: str) -> str:
    return path[1:] if path.startswith("/") else path


def _user_room(user_id: str) -> str:
    return f"user:{user_id}"


def _role_room(role_code: str) -> str:
    return f"role:{role_code}"


class RealtimeGateway:
    def __init__(
        self,
        settings: Settings,
        *,
        session_factory: SessionFactory = SessionLocal,
    ) -> None:
        manager: socketio.AsyncManager | None = None
        if settings.realtime_redis_url.startswith(("redis://", "rediss://")):
            manager = socketio.AsyncRedisManager(settings.realtime_redis_url)
        self.settings = settings
        self.session_factory = session_factory
        self.store: RealtimeStore = build_realtime_store(settings)
        self.sio = socketio.AsyncServer(
            async_mode="asgi",
            client_manager=manager,
            cors_allowed_origins=list(settings.allowed_origins),
        )
        self._register_handlers()

    def set_session_factory(self, session_factory: SessionFactory) -> None:
        self.session_factory = session_factory

    def set_settings(self, settings: Settings) -> None:
        self.settings = settings
        self.store = build_realtime_store(settings)

    async def emit_to_user(
        self, event_name: str, message: dict[str, object], *, user_id: str
    ) -> None:
        await self.sio.emit(event_name, message, room=_user_room(user_id))

    async def emit_to_room(
        self, event_name: str, message: dict[str, object], *, room: str
    ) -> None:
        await self.sio.emit(event_name, message, room=room)

    async def emit_broadcast(self, event_name: str, message: dict[str, object]) -> None:
        await self.sio.emit(event_name, message)

    def emit_to_user_sync(
        self, event_name: str, message: dict[str, object], *, user_id: str
    ) -> None:
        self._run_coroutine(self.emit_to_user(event_name, message, user_id=user_id))

    def emit_to_room_sync(
        self, event_name: str, message: dict[str, object], *, room: str
    ) -> None:
        self._run_coroutine(self.emit_to_room(event_name, message, room=room))

    def emit_broadcast_sync(self, event_name: str, message: dict[str, object]) -> None:
        self._run_coroutine(self.emit_broadcast(event_name, message))

    def update_unread_count_cache(self, *, user_id: str, unread_count: int) -> None:
        self.store.set_unread_count(user_id=user_id, unread_count=unread_count)

    def create_asgi_app(self, http_app) -> socketio.ASGIApp:
        return socketio.ASGIApp(
            self.sio,
            other_asgi_app=http_app,
            socketio_path=_normalize_socket_path(self.settings.realtime_socket_path),
        )

    def _register_handlers(self) -> None:
        @self.sio.event
        async def connect(sid: str, environ: dict, auth: dict | None) -> bool:
            del environ
            token = auth.get("token") if isinstance(auth, dict) else None
            if not isinstance(token, str) or not token:
                raise ConnectionRefusedError("Authentication required")

            actor = self._authenticate_token(token)
            await self.sio.save_session(
                sid,
                {
                    "user_id": actor.user_id,
                    "session_id": actor.session_id,
                    "active_role": actor.active_role,
                },
            )
            await self.sio.enter_room(sid, _user_room(actor.user_id))
            await self.sio.enter_room(sid, _role_room(actor.active_role))
            self.store.add_socket(user_id=actor.user_id, socket_id=sid)
            self.store.touch_user(user_id=actor.user_id, last_seen=utcnow())

            with self.session_factory() as db:
                pending_notifications = get_pending_notifications(db, user_id=actor.user_id)
            for notification in pending_notifications:
                await self.emit_to_user(
                    "notification.created",
                    build_notification_message(notification),
                    user_id=actor.user_id,
                )
            return True

        @self.sio.event
        async def disconnect(sid: str) -> None:
            user_id = self.store.remove_socket(sid, last_seen=utcnow())
            if user_id is not None:
                self.store.touch_user(user_id=user_id, last_seen=utcnow())

        @self.sio.on("notification.ack")
        async def notification_ack(sid: str, payload: dict[str, object] | None) -> None:
            session = await self.sio.get_session(sid)
            user_id = session.get("user_id")
            notification_id = payload.get("notification_id") if isinstance(payload, dict) else None
            if not isinstance(user_id, str) or not isinstance(notification_id, str):
                return

            with self.session_factory() as db:
                notification, unread_count, changed = acknowledge_notification(
                    db, user_id=user_id, notification_id=notification_id
                )

            if notification is not None and changed:
                self.update_unread_count_cache(user_id=user_id, unread_count=unread_count)
                await self.emit_to_user(
                    "notification.updated",
                    build_notification_update_message(
                        notification, unread_count=unread_count
                    ),
                    user_id=user_id,
                )
            self.store.touch_user(user_id=user_id, last_seen=utcnow())

    def _authenticate_token(self, token: str):
        with self.session_factory() as db:
            auth_service = AuthService(db=db, settings=self.settings)
            return auth_service.authenticate_token(token)

    def _run_coroutine(self, coroutine) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(coroutine)
            return
        loop.create_task(coroutine)


_gateway: RealtimeGateway | None = None


def configure_realtime_gateway(
    *,
    settings: Settings | None = None,
    session_factory: SessionFactory | None = None,
) -> RealtimeGateway:
    global _gateway
    if _gateway is None:
        _gateway = RealtimeGateway(
            settings or get_settings(),
            session_factory=session_factory or SessionLocal,
        )
        return _gateway

    if settings is not None:
        _gateway.set_settings(settings)
    if session_factory is not None:
        _gateway.set_session_factory(session_factory)
    return _gateway


def get_realtime_gateway() -> RealtimeGateway:
    return configure_realtime_gateway()


def create_socketio_app(http_app, settings: Settings | None = None):
    gateway = configure_realtime_gateway(settings=settings)
    return gateway.create_asgi_app(http_app)


def emit_notification_created_sync(notification) -> None:
    gateway = get_realtime_gateway()
    gateway.emit_to_user_sync(
        "notification.created",
        build_notification_message(notification),
        user_id=notification.user_id,
    )


def emit_notification_updated_sync(notification, *, unread_count: int) -> None:
    gateway = get_realtime_gateway()
    gateway.emit_to_user_sync(
        "notification.updated",
        build_notification_update_message(notification, unread_count=unread_count),
        user_id=notification.user_id,
    )


def emit_broadcast_sync(event_name: str, message: dict[str, object]) -> None:
    gateway = get_realtime_gateway()
    gateway.emit_broadcast_sync(event_name, message)


def emit_ticket_changed_sync(
    message: dict[str, object], *, customer_user_id: str | None
) -> None:
    gateway = get_realtime_gateway()
    for role_code in (
        RoleCode.T1.value,
        RoleCode.T2.value,
        RoleCode.T3.value,
        RoleCode.ADMIN.value,
    ):
        gateway.emit_to_room_sync(
            "ticket.changed",
            message,
            room=_role_room(role_code),
        )
    if customer_user_id:
        gateway.emit_to_user_sync(
            "ticket.changed",
            message,
            user_id=customer_user_id,
        )


def update_unread_count_cache(*, user_id: str, unread_count: int) -> None:
    gateway = get_realtime_gateway()
    gateway.update_unread_count_cache(user_id=user_id, unread_count=unread_count)
