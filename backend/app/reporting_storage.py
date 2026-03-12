from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

from app.config import Settings


FILENAME_SANITIZE_PATTERN = re.compile(r"[^A-Za-z0-9._-]+")


@dataclass(frozen=True)
class StoredFile:
    original_filename: str
    content_type: str | None
    size_bytes: int
    storage_key: str


def _storage_root(settings: Settings) -> Path:
    return Path(settings.report_storage_dir).resolve()


def _safe_filename(filename: str | None) -> str:
    if not filename:
        return "file"
    return FILENAME_SANITIZE_PATTERN.sub("-", filename).strip("-") or "file"


def _storage_path(settings: Settings, storage_key: str) -> Path:
    return _storage_root(settings) / storage_key


async def save_upload_file(settings: Settings, *, area: str, upload_file: UploadFile) -> StoredFile:
    root = _storage_root(settings)
    root.mkdir(parents=True, exist_ok=True)

    original_filename = upload_file.filename or "file"
    safe_name = _safe_filename(original_filename)
    storage_key = f"{area}/{uuid.uuid4()}-{safe_name}"
    path = root / storage_key
    path.parent.mkdir(parents=True, exist_ok=True)

    size_bytes = 0
    with path.open("wb") as output:
        while True:
            chunk = await upload_file.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)
            size_bytes += len(chunk)
    await upload_file.close()

    return StoredFile(
        original_filename=original_filename,
        content_type=upload_file.content_type,
        size_bytes=size_bytes,
        storage_key=storage_key,
    )


def save_bytes(
    settings: Settings,
    *,
    area: str,
    filename: str,
    content: bytes,
    content_type: str | None = None,
) -> StoredFile:
    root = _storage_root(settings)
    root.mkdir(parents=True, exist_ok=True)

    original_filename = filename or "file"
    safe_name = _safe_filename(original_filename)
    storage_key = f"{area}/{uuid.uuid4()}-{safe_name}"
    path = root / storage_key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)

    return StoredFile(
        original_filename=original_filename,
        content_type=content_type,
        size_bytes=len(content),
        storage_key=storage_key,
    )


def read_file_bytes(settings: Settings, storage_key: str) -> bytes | None:
    path = _storage_path(settings, storage_key)
    if not path.exists():
        return None
    return path.read_bytes()


def delete_file(settings: Settings, storage_key: str) -> None:
    path = _storage_path(settings, storage_key)
    if path.exists():
        path.unlink()

    parent = path.parent
    root = _storage_root(settings)
    while parent != root and parent.exists():
        try:
            parent.rmdir()
        except OSError:
            break
        parent = parent.parent
