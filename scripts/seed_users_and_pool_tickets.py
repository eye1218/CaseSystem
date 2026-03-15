#!/usr/bin/env python3
from __future__ import annotations

import argparse
import random
import sys
from dataclasses import dataclass

import httpx


POOL_CODES = ("T1_POOL", "T2_POOL", "T3_POOL")
CATEGORY_IDS = ("intrusion", "network", "data", "endpoint", "phishing")
PRIORITY_LEVELS = ("P1", "P2", "P3", "P4")


@dataclass(frozen=True)
class SeedUser:
    username: str
    display_name: str
    email: str
    password: str
    role_codes: tuple[str, ...]


SEED_USERS: tuple[SeedUser, ...] = (
    SeedUser(
        username="seed_t1_user",
        display_name="Seed T1 User",
        email="seed_t1_user@example.com",
        password="SeedT1Pass123!",
        role_codes=("T1",),
    ),
    SeedUser(
        username="seed_t2_user",
        display_name="Seed T2 User",
        email="seed_t2_user@example.com",
        password="SeedT2Pass123!",
        role_codes=("T2",),
    ),
    SeedUser(
        username="seed_t3_user",
        display_name="Seed T3 User",
        email="seed_t3_user@example.com",
        password="SeedT3Pass123!",
        role_codes=("T3",),
    ),
    SeedUser(
        username="seed_admin_user",
        display_name="Seed Admin User",
        email="seed_admin_user@example.com",
        password="SeedAdminPass123!",
        role_codes=("ADMIN",),
    ),
    SeedUser(
        username="seed_customer_user",
        display_name="Seed Customer User",
        email="seed_customer_user@example.com",
        password="SeedCustomerPass123!",
        role_codes=("CUSTOMER",),
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create one new user per role and add random pool tickets into CaseSystem."
    )
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8011",
        help="CaseSystem base URL, e.g. http://127.0.0.1:8011",
    )
    parser.add_argument(
        "--origin",
        default=None,
        help="Optional Origin header. Defaults to base URL.",
    )
    parser.add_argument("--username", default="admin", help="Admin login username")
    parser.add_argument("--password", default="AdminPass123", help="Admin login password")
    parser.add_argument("--ticket-count", type=int, default=200, help="Number of tickets to create")
    parser.add_argument(
        "--seed",
        type=int,
        default=20260315,
        help="Random seed for reproducible pool/assignee selection",
    )
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


def auth_headers(client: httpx.Client, *, origin: str) -> dict[str, str]:
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


def switch_role(client: httpx.Client, *, role_code: str, origin: str) -> None:
    response = client.post(
        "/auth/switch-role",
        json={"active_role_code": role_code},
        headers=auth_headers(client, origin=origin),
    )
    if response.status_code != 200:
        raise RuntimeError(f"Switch role failed: {response.status_code} {response.text}")


def list_existing_users(client: httpx.Client) -> list[dict[str, object]]:
    response = client.get("/api/v1/users")
    response.raise_for_status()
    payload = response.json()
    return list(payload.get("items", []))


def ensure_seed_users(client: httpx.Client, *, origin: str) -> list[dict[str, object]]:
    existing_users = list_existing_users(client)
    existing_by_username = {
        str(item["username"]): item
        for item in existing_users
        if isinstance(item, dict) and "username" in item
    }
    resolved: list[dict[str, object]] = []
    for user in SEED_USERS:
        existing = existing_by_username.get(user.username)
        if existing is not None:
            resolved.append(existing)
            print(f"USER EXISTS: {user.username}")
            continue
        response = client.post(
            "/api/v1/users",
            json={
                "username": user.username,
                "display_name": user.display_name,
                "email": user.email,
                "password": user.password,
                "role_codes": list(user.role_codes),
                "group_ids": [],
            },
            headers=auth_headers(client, origin=origin),
        )
        if response.status_code != 200:
            raise RuntimeError(
                f"Create user failed for {user.username}: {response.status_code} {response.text}"
            )
        created = response.json()["user"]
        resolved.append(created)
        print(f"USER CREATED: {user.username} roles={','.join(user.role_codes)}")
    return resolved


def list_internal_target_users(client: httpx.Client) -> list[dict[str, object]]:
    response = client.get("/api/v1/tickets/internal-target-users")
    response.raise_for_status()
    payload = response.json()
    return list(payload.get("items", []))


def build_ticket_payload(*, rng: random.Random, index: int) -> dict[str, object]:
    pool_code = rng.choice(POOL_CODES)
    category_id = rng.choice(CATEGORY_IDS)
    priority = rng.choice(PRIORITY_LEVELS)
    risk_score = rng.randint(20, 95)
    return {
        "title": f"[SEED] 工单池灌数 #{index + 1}",
        "description": f"批量灌数工单 #{index + 1}，用于验证工单池、领取和分配场景。",
        "category_id": category_id,
        "priority": priority,
        "risk_score": risk_score,
        "assignment_mode": "pool",
        "pool_code": pool_code,
    }


def create_ticket(client: httpx.Client, *, payload: dict[str, object], origin: str) -> dict[str, object]:
    response = client.post(
        "/api/v1/tickets",
        json=payload,
        headers=auth_headers(client, origin=origin),
    )
    if response.status_code != 200:
        raise RuntimeError(f"Create ticket failed: {response.status_code} {response.text}")
    return response.json()


def assign_ticket(
    client: httpx.Client,
    *,
    ticket_id: int,
    version: int,
    target_user_id: str,
    origin: str,
) -> dict[str, object]:
    response = client.post(
        f"/api/v1/tickets/{ticket_id}/assign",
        json={"version": version, "target_user_id": target_user_id},
        headers=auth_headers(client, origin=origin),
    )
    if response.status_code != 200:
        raise RuntimeError(
            f"Assign ticket failed ticket_id={ticket_id} user_id={target_user_id}: "
            f"{response.status_code} {response.text}"
        )
    return response.json()


def create_random_tickets(
    client: httpx.Client,
    *,
    origin: str,
    ticket_count: int,
    seed: int,
    internal_users: list[dict[str, object]],
) -> dict[str, object]:
    rng = random.Random(seed)
    created_ids: list[int] = []
    assigned_ids: list[int] = []
    pool_counts = {pool_code: 0 for pool_code in POOL_CODES}
    assignee_counts: dict[str, int] = {}

    if not internal_users:
        raise RuntimeError("No internal users available for random assignment")

    candidate_user_ids = [str(item["id"]) for item in internal_users]
    candidate_display_names = {str(item["id"]): str(item["display_name"]) for item in internal_users}

    for index in range(ticket_count):
        payload = build_ticket_payload(rng=rng, index=index)
        detail = create_ticket(client, payload=payload, origin=origin)
        ticket = detail["ticket"]
        ticket_id = int(ticket["id"])
        version = int(ticket["version"])
        current_pool_code = str(ticket["current_pool_code"])
        pool_counts[current_pool_code] += 1
        created_ids.append(ticket_id)

        should_assign = rng.choice((True, False))
        if not should_assign:
            continue

        target_user_id = rng.choice(candidate_user_ids)
        assign_detail = assign_ticket(
            client,
            ticket_id=ticket_id,
            version=version,
            target_user_id=target_user_id,
            origin=origin,
        )
        assigned_ticket = assign_detail["ticket"]
        assigned_ids.append(int(assigned_ticket["id"]))
        assignee_counts[target_user_id] = assignee_counts.get(target_user_id, 0) + 1

    return {
        "created_ids": created_ids,
        "assigned_ids": assigned_ids,
        "pool_counts": pool_counts,
        "assignee_counts": {
            candidate_display_names[user_id]: count
            for user_id, count in sorted(assignee_counts.items())
        },
    }


def main() -> int:
    args = parse_args()
    base_url = normalize_base_url(args.base_url)
    origin = args.origin or base_url

    if args.ticket_count < 1:
        print("ticket-count must be greater than 0", file=sys.stderr)
        return 2

    with httpx.Client(base_url=base_url, timeout=args.timeout, follow_redirects=True) as client:
        login(client, username=args.username, password=args.password, origin=origin)
        switch_role(client, role_code="ADMIN", origin=origin)

        created_or_existing_users = ensure_seed_users(client, origin=origin)
        internal_target_users = list_internal_target_users(client)
        result = create_random_tickets(
            client,
            origin=origin,
            ticket_count=args.ticket_count,
            seed=args.seed,
            internal_users=internal_target_users,
        )

    print("---- SUMMARY ----")
    print(f"USERS READY: {len(created_or_existing_users)}")
    for user in SEED_USERS:
        print(
            f"{user.username} / {user.password} / roles={','.join(user.role_codes)}"
        )
    print(f"TICKETS CREATED: {len(result['created_ids'])}")
    print(f"TICKETS ASSIGNED: {len(result['assigned_ids'])}")
    print(f"TICKETS UNASSIGNED: {len(result['created_ids']) - len(result['assigned_ids'])}")
    print("POOL COUNTS:")
    for pool_code, count in result["pool_counts"].items():
        print(f"  {pool_code}: {count}")
    print("ASSIGNEE COUNTS:")
    for display_name, count in result["assignee_counts"].items():
        print(f"  {display_name}: {count}")
    if result["created_ids"]:
        print(f"FIRST CREATED TICKET ID: {result['created_ids'][0]}")
        print(f"LAST CREATED TICKET ID: {result['created_ids'][-1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
