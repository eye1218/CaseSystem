from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import RoleCode
from app.models import ApiToken, Role, User, UserRole
from app.modules.config.service import seed_default_configs
from app.modules.knowledge.service import seed_knowledge
from app.security import generate_refresh_token, hash_opaque_token, hash_password
from app.ticketing import seed_tickets

logger = logging.getLogger(__name__)


SYSTEM_ROLES = {
    RoleCode.T1.value: {"name": "Tier 1 Analyst", "category": "internal", "sort_order": 10},
    RoleCode.T2.value: {"name": "Tier 2 Analyst", "category": "internal", "sort_order": 20},
    RoleCode.T3.value: {"name": "Tier 3 Analyst", "category": "internal", "sort_order": 30},
    RoleCode.ADMIN.value: {"name": "Administrator", "category": "internal", "sort_order": 40},
    RoleCode.CUSTOMER.value: {"name": "Customer", "category": "external", "sort_order": 50},
}

DEMO_USERS = [
    {
        "id": "user-admin",
        "username": "admin",
        "email": "admin@example.com",
        "display_name": "Admin",
        "password": "AdminPass123",
        "roles": [RoleCode.T2.value, RoleCode.ADMIN.value],
        "primary_role": RoleCode.T2.value,
    },
    {
        "id": "user-customer",
        "username": "customer",
        "email": "customer@example.com",
        "display_name": "Customer",
        "password": "CustomerPass123",
        "roles": [RoleCode.CUSTOMER.value],
        "primary_role": RoleCode.CUSTOMER.value,
    },
    {
        "id": "user-analyst",
        "username": "analyst",
        "email": "analyst@example.com",
        "display_name": "Analyst",
        "password": "AnalystPass123",
        "roles": [RoleCode.T1.value, RoleCode.T2.value],
        "primary_role": RoleCode.T1.value,
    },
]


def seed_roles(db: Session) -> None:
    existing_codes = set(db.scalars(select(Role.code)).all())
    for code, payload in SYSTEM_ROLES.items():
        if code in existing_codes:
            continue
        db.add(Role(code=code, **payload))
    db.commit()
    seed_default_configs(db)
    db.commit()
    seed_demo_users(db)
    seed_api_tokens(db)
    seed_tickets(db)
    seed_knowledge(db)


def seed_demo_users(db: Session) -> None:
    existing_usernames = set(db.scalars(select(User.username)).all())
    existing_role_pairs = {
        (user_role.user_id, user_role.role_code)
        for user_role in db.scalars(select(UserRole)).all()
    }

    for payload in DEMO_USERS:
        if payload["username"] not in existing_usernames:
            db.add(
                User(
                    id=payload["id"],
                    username=payload["username"],
                    email=payload["email"],
                    display_name=payload["display_name"],
                    password_hash=hash_password(payload["password"]),
                    status="active",
                )
            )

        for role_code in payload["roles"]:
            pair = (payload["id"], role_code)
            if pair in existing_role_pairs:
                continue
            db.add(
                UserRole(
                    user_id=payload["id"],
                    role_code=role_code,
                    is_primary=role_code == payload["primary_role"],
                )
            )

    db.commit()


def seed_api_tokens(db: Session) -> None:
    existing_user_ids = set(
        db.scalars(select(ApiToken.user_id)).all()
    )

    for payload in DEMO_USERS:
        user_id = payload["id"]
        if user_id in existing_user_ids:
            continue
        primary_role = payload["primary_role"]
        raw_token = "csk_" + generate_refresh_token()
        db.add(
            ApiToken(
                user_id=user_id,
                name="Default API Token",
                token_hash=hash_opaque_token(raw_token),
                active_role_code=primary_role,
                status="active",
                created_by="bootstrap",
            )
        )
        logger.info(
            "Demo API token for user '%s' (%s): %s",
            payload["username"],
            primary_role,
            raw_token,
        )

    db.commit()
