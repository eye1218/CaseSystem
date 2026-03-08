from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CaseSystem Auth Service"
    environment: str = "development"
    database_url: str = "sqlite:///./casesystem.db"
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "casesystem-auth"
    jwt_audience: str = "casesystem-api"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 14
    csrf_token_ttl_minutes: int = 30
    cookie_secure: bool = True
    cookie_domain: str | None = None
    allowed_origins: List[str] = Field(
        default_factory=lambda: [
            "https://testserver",
            "https://localhost",
            "https://127.0.0.1",
        ]
    )
    throttle_sleep_enabled: bool = False

    model_config = SettingsConfigDict(
        env_prefix="CASESYSTEM_",
        env_file=".env",
        env_file_encoding="utf-8",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
