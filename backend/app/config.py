from __future__ import annotations

from functools import lru_cache
from typing import ClassVar

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CaseSystem API"
    environment: str = "development"
    database_url: str = "sqlite:///./casesystem.db"
    jwt_secret_key: str = "change-me-in-production-at-least-32-bytes"
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "casesystem-auth"
    jwt_audience: str = "casesystem-api"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 14
    csrf_token_ttl_minutes: int = 30
    cookie_secure: bool = False
    cookie_domain: str | None = None
    allowed_origins: list[str] = Field(
        default_factory=lambda: [
            "https://testserver",
            "https://localhost",
            "https://127.0.0.1",
            "http://localhost:8010",
            "http://127.0.0.1:8010",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://192.168.2.170:8010",
        ]
    )
    throttle_sleep_enabled: bool = False
    celery_broker_url: str = "memory://"
    celery_result_backend: str = "cache+memory://"
    celery_task_always_eager: bool = True
    celery_task_eager_propagates: bool = True
    celery_event_sweep_interval_seconds: int = 30
    realtime_redis_url: str = "memory://"
    realtime_socket_path: str = "/socket.io"
    realtime_socket_token_ttl_minutes: int = 15
    ticket_cache_ttl_seconds: int = 60

    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_prefix="CASESYSTEM_",
        env_file=".env",
        env_file_encoding="utf-8",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
