from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from casesystem.enums import RoleCode
from casesystem.models import Role


SYSTEM_ROLES = {
    RoleCode.T1.value: {"name": "Tier 1 Analyst", "category": "internal", "sort_order": 10},
    RoleCode.T2.value: {"name": "Tier 2 Analyst", "category": "internal", "sort_order": 20},
    RoleCode.T3.value: {"name": "Tier 3 Analyst", "category": "internal", "sort_order": 30},
    RoleCode.ADMIN.value: {"name": "Administrator", "category": "internal", "sort_order": 40},
    RoleCode.CUSTOMER.value: {"name": "Customer", "category": "external", "sort_order": 50},
}


def seed_roles(db: Session) -> None:
    existing_codes = set(db.scalars(select(Role.code)).all())
    for code, payload in SYSTEM_ROLES.items():
        if code in existing_codes:
            continue
        db.add(Role(code=code, **payload))
    db.commit()

