from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from casesystem.config import Settings

password_hasher = PasswordHasher(memory_cost=19456, time_cost=2, parallelism=1)


def utcnow() -> datetime:
    return datetime.utcnow()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return password_hasher.verify(hashed_password, password)
    except VerifyMismatchError:
        return False


def maybe_rehash_password(password: str, hashed_password: str) -> str | None:
    if password_hasher.check_needs_rehash(hashed_password):
        return hash_password(password)
    return None


def create_access_token(*, settings: Settings, user_id: str, session_id: str, token_version: int, role_version: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "sub": user_id,
        "sid": session_id,
        "tv": token_version,
        "rv": role_version,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_ttl_minutes)).timestamp()),
    }
    headers = {"typ": "at+jwt", "alg": settings.jwt_algorithm}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm, headers=headers)


def decode_access_token(token: str, settings: Settings) -> dict[str, Any]:
    header = jwt.get_unverified_header(token)
    if header.get("typ") != "at+jwt":
        raise jwt.InvalidTokenError("invalid token type")
    if header.get("alg") != settings.jwt_algorithm:
        raise jwt.InvalidAlgorithmError("unexpected algorithm")
    return jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
        audience=settings.jwt_audience,
        issuer=settings.jwt_issuer,
        options={"require": ["iss", "aud", "exp", "nbf", "iat", "sub", "sid", "tv", "rv"]},
    )


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_opaque_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)
