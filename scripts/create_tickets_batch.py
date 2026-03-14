#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass

import httpx


CATEGORY_IDS = ("intrusion", "network", "data", "endpoint", "phishing")
PRIORITY_LEVELS = ("P1", "P2", "P3", "P4")


@dataclass(frozen=True)
class BatchSpec:
    label: str
    count: int
    pool_code: str | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create tickets via CaseSystem API. "
            "Defaults: 200 total = 100 default pool + 50 T2 + 50 T3."
        )
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Backend base URL, e.g. http://127.0.0.1:8000")
    parser.add_argument("--origin", default=None, help="Origin header for CSRF checks (defaults to base URL)")
    parser.add_argument("--username", default="admin", help="Login username")
    parser.add_argument("--password", default="AdminPass123", help="Login password")
    parser.add_argument("--total", type=int, default=200, help="Total tickets to create")
    parser.add_argument("--t2-count", type=int, default=50, help="Number of T2_POOL tickets")
    parser.add_argument("--t3-count", type=int, default=50, help="Number of T3_POOL tickets")
    parser.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout in seconds")
    return parser.parse_args()


def normalize_base_url(base_url: str) -> str:
    return base_url.rstrip("/")


def get_csrf_token(client: httpx.Client) -> str:
    response = client.get("/auth/csrf")
    response.raise_for_status()
    payload = response.json()
    token = payload.get("csrf_token")
    if not isinstance(token, str) or not token:
        raise RuntimeError("Missing csrf_token in /auth/csrf response")
    return token


def auth_headers(*, client: httpx.Client, origin: str) -> dict[str, str]:
    token = client.cookies.get("XSRF-TOKEN")
    if not token:
        token = get_csrf_token(client)
    return {"X-CSRF-Token": token, "Origin": origin}


def login(client: httpx.Client, *, username: str, password: str, origin: str) -> None:
    csrf_token = get_csrf_token(client)
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password},
        headers={"X-CSRF-Token": csrf_token, "Origin": origin},
    )
    if response.status_code != 200:
        raise RuntimeError(f"Login failed: {response.status_code} {response.text}")


def build_ticket_payload(*, index: int, batch_label: str, pool_code: str | None) -> dict[str, object]:
    category_id = CATEGORY_IDS[index % len(CATEGORY_IDS)]
    priority = PRIORITY_LEVELS[index % len(PRIORITY_LEVELS)]
    risk_score = 35 + (index * 3 % 60)

    payload: dict[str, object] = {
        "title": f"[{batch_label}] 批量工单 #{index + 1}",
        "description": f"通过脚本自动创建的 {batch_label} 工单，用于分页与列表验证。",
        "category_id": category_id,
        "priority": priority,
        "risk_score": risk_score,
        "assignment_mode": "pool",
    }
    if pool_code:
        payload["pool_code"] = pool_code
    return payload


def create_tickets(client: httpx.Client, *, batch: BatchSpec, origin: str, start_index: int) -> list[int]:
    created_ids: list[int] = []
    for step in range(batch.count):
        payload = build_ticket_payload(
            index=start_index + step,
            batch_label=batch.label,
            pool_code=batch.pool_code,
        )
        response = client.post(
            "/api/v1/tickets",
            json=payload,
            headers=auth_headers(client=client, origin=origin),
        )
        if response.status_code != 200:
            raise RuntimeError(
                f"Create ticket failed in batch={batch.label} index={step + 1}: "
                f"{response.status_code} {response.text}"
            )
        body = response.json()
        ticket = body.get("ticket", {})
        ticket_id = ticket.get("id")
        if not isinstance(ticket_id, int):
            raise RuntimeError(f"Unexpected ticket payload in batch={batch.label}: {body}")
        created_ids.append(ticket_id)
    return created_ids


def main() -> int:
    args = parse_args()
    base_url = normalize_base_url(args.base_url)
    origin = args.origin or base_url

    if args.total < 1:
        print("total must be greater than 0", file=sys.stderr)
        return 2
    if args.t2_count < 0 or args.t3_count < 0:
        print("t2-count and t3-count must be >= 0", file=sys.stderr)
        return 2

    default_count = args.total - args.t2_count - args.t3_count
    if default_count < 0:
        print("total must be >= t2-count + t3-count", file=sys.stderr)
        return 2

    batches = [
        BatchSpec(label="DEFAULT_POOL", count=default_count, pool_code=None),
        BatchSpec(label="T2_POOL", count=args.t2_count, pool_code="T2_POOL"),
        BatchSpec(label="T3_POOL", count=args.t3_count, pool_code="T3_POOL"),
    ]

    created_ids: list[int] = []
    with httpx.Client(base_url=base_url, timeout=args.timeout, follow_redirects=True) as client:
        login(client, username=args.username, password=args.password, origin=origin)
        running_index = 0
        for batch in batches:
            if batch.count == 0:
                continue
            batch_ids = create_tickets(
                client,
                batch=batch,
                origin=origin,
                start_index=running_index,
            )
            running_index += batch.count
            created_ids.extend(batch_ids)
            print(f"{batch.label}: created {len(batch_ids)} tickets")

    print(f"TOTAL CREATED: {len(created_ids)}")
    if created_ids:
        print(f"FIRST ID: {created_ids[0]}")
        print(f"LAST ID: {created_ids[-1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
