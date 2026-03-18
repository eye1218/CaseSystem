from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from functools import cmp_to_key

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...enums import RoleCode, UserStatus
from ...models import User, UserRole
from ...security import utcnow
from ..tickets.models import Ticket

INTERNAL_ROLE_CODES = {
    RoleCode.T1.value,
    RoleCode.T2.value,
    RoleCode.T3.value,
    RoleCode.ADMIN.value,
}

ROLE_RANK = {
    RoleCode.T1.value: 1,
    RoleCode.T2.value: 2,
    RoleCode.T3.value: 3,
    RoleCode.ADMIN.value: 4,
}

ALLOWED_WINDOW_DAYS = {7, 30, 90}
ALLOWED_SORT_FIELDS = {
    "username",
    "display_name",
    "highest_role_code",
    "handled_count",
    "avg_response_seconds",
    "avg_resolution_seconds",
    "sla_attainment_rate",
    "weighted_sla_attainment_rate",
}


class KpiOperationError(Exception):
    status_code: int
    detail: str

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class WindowContext:
    window_days: int
    window_start: datetime
    window_end: datetime
    start_day: date
    end_day: date


@dataclass
class _DailyAccumulator:
    handled_count: int = 0
    sla_denom: int = 0
    sla_pass: int = 0
    weighted_denom: int = 0
    weighted_pass: int = 0


def _iter_days(start_day: date, end_day: date) -> list[date]:
    total = (end_day - start_day).days
    return [start_day + timedelta(days=offset) for offset in range(total + 1)]


def _resolve_window(window_days: int) -> WindowContext:
    if window_days not in ALLOWED_WINDOW_DAYS:
        raise KpiOperationError(422, "window_days must be one of 7, 30, 90")

    now = utcnow()
    end_day = now.date()
    start_day = end_day - timedelta(days=window_days - 1)
    return WindowContext(
        window_days=window_days,
        window_start=datetime.combine(start_day, time.min),
        window_end=now,
        start_day=start_day,
        end_day=end_day,
    )


def _require_overview_access(actor: ActorContext) -> None:
    if actor.active_role not in {
        RoleCode.T2.value,
        RoleCode.T3.value,
        RoleCode.ADMIN.value,
    }:
        raise KpiOperationError(403, "Current role cannot access KPI overview")


def _require_admin_access(actor: ActorContext) -> None:
    if actor.active_role != RoleCode.ADMIN.value:
        raise KpiOperationError(403, "Admin role required")


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_role_filter(role_code: str | None) -> str | None:
    if role_code is None:
        return None
    normalized = role_code.strip().upper()
    if not normalized:
        return None
    if normalized not in INTERNAL_ROLE_CODES:
        raise KpiOperationError(422, "role_code must be one of T1, T2, T3, ADMIN")
    return normalized


def _normalize_sort(sort_by: str, sort_dir: str) -> tuple[str, str]:
    normalized_sort_by = sort_by.strip()
    normalized_sort_dir = sort_dir.strip().lower()

    if normalized_sort_by not in ALLOWED_SORT_FIELDS:
        raise KpiOperationError(
            422,
            "sort_by must be one of username, display_name, highest_role_code, handled_count, avg_response_seconds, avg_resolution_seconds, sla_attainment_rate, weighted_sla_attainment_rate",
        )
    if normalized_sort_dir not in {"asc", "desc"}:
        raise KpiOperationError(422, "sort_dir must be `asc` or `desc`")

    return normalized_sort_by, normalized_sort_dir


def _round_optional(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 2)


def _safe_ratio(numerator: int | float, denominator: int | float) -> float | None:
    if denominator <= 0:
        return None
    return float(numerator) / float(denominator)


def _duration_seconds(start_at: datetime, end_at: datetime) -> float:
    return max((end_at - start_at).total_seconds(), 0.0)


def _within_window(value: datetime | None, window: WindowContext) -> bool:
    return value is not None and window.window_start <= value <= window.window_end


def _completion_at(ticket: Ticket) -> datetime | None:
    return ticket.closed_at or ticket.resolved_at


def _load_internal_users(db: Session) -> list[dict[str, object]]:
    now = utcnow()
    rows = db.execute(
        select(User.id, User.username, User.display_name, UserRole.role_code)
        .join(UserRole, UserRole.user_id == User.id)
        .where(
            User.status == UserStatus.ACTIVE.value,
            UserRole.is_active.is_(True),
            UserRole.role_code.in_(INTERNAL_ROLE_CODES),
            or_(UserRole.expires_at.is_(None), UserRole.expires_at > now),
        )
    ).all()

    by_user_id: dict[str, dict[str, object]] = {}
    for user_id, username, display_name, role_code in rows:
        entry = by_user_id.setdefault(
            user_id,
            {
                "user_id": user_id,
                "username": username,
                "display_name": display_name,
                "roles": set(),
            },
        )
        roles = entry["roles"]
        if isinstance(roles, set):
            roles.add(role_code)

    normalized: list[dict[str, object]] = []
    for entry in by_user_id.values():
        role_set = entry["roles"]
        if not isinstance(role_set, set) or not role_set:
            continue
        roles = sorted(role_set, key=lambda item: ROLE_RANK.get(item, 0))
        highest_role_code = max(roles, key=lambda item: ROLE_RANK.get(item, 0))
        normalized.append(
            {
                "user_id": entry["user_id"],
                "username": entry["username"],
                "display_name": entry["display_name"],
                "roles": roles,
                "highest_role_code": highest_role_code,
            }
        )

    normalized.sort(
        key=lambda item: (
            str(item["display_name"]).lower(),
            str(item["username"]).lower(),
        )
    )
    return normalized


def _load_relevant_tickets(
    db: Session,
    *,
    assignee_user_ids: set[str],
    window: WindowContext,
) -> list[Ticket]:
    if not assignee_user_ids:
        return []

    return list(
        db.scalars(
            select(Ticket).where(
                Ticket.is_deleted.is_(False),
                Ticket.assigned_to_user_id.in_(assignee_user_ids),
                or_(
                    and_(
                        Ticket.responded_at.is_not(None),
                        Ticket.responded_at >= window.window_start,
                        Ticket.responded_at <= window.window_end,
                    ),
                    and_(
                        Ticket.resolved_at.is_not(None),
                        Ticket.resolved_at >= window.window_start,
                        Ticket.resolved_at <= window.window_end,
                    ),
                    and_(
                        Ticket.closed_at.is_not(None),
                        Ticket.closed_at >= window.window_start,
                        Ticket.closed_at <= window.window_end,
                    ),
                ),
            )
        ).all()
    )


def _aggregate_metrics(
    tickets: list[Ticket],
    *,
    window: WindowContext,
    include_trend: bool,
) -> tuple[dict[str, object], list[dict[str, object]]]:
    response_total_seconds = 0.0
    response_count = 0
    resolution_total_seconds = 0.0
    resolution_count = 0
    handled_count = 0
    sla_denom = 0
    sla_pass = 0
    weighted_sla_denom = 0
    weighted_sla_pass = 0

    daily: dict[date, _DailyAccumulator] = {}
    if include_trend:
        daily = {day: _DailyAccumulator() for day in _iter_days(window.start_day, window.end_day)}

    for ticket in tickets:
        responded_at = ticket.responded_at
        completion_at = _completion_at(ticket)

        if _within_window(responded_at, window):
            response_total_seconds += _duration_seconds(ticket.created_at, responded_at)
            response_count += 1

        if not _within_window(completion_at, window):
            continue

        handled_count += 1
        resolution_total_seconds += _duration_seconds(ticket.created_at, completion_at)
        resolution_count += 1

        has_sla_context = (
            responded_at is not None
            and ticket.response_deadline_at is not None
            and completion_at is not None
            and ticket.resolution_deadline_at is not None
        )

        if has_sla_context:
            sla_denom += 1
            weighted_sla_denom += ticket.risk_score
            is_attained = (
                responded_at <= ticket.response_deadline_at
                and completion_at <= ticket.resolution_deadline_at
            )
            if is_attained:
                sla_pass += 1
                weighted_sla_pass += ticket.risk_score

        if include_trend:
            completion_day = completion_at.date()
            day_bucket = daily.get(completion_day)
            if day_bucket is None:
                continue
            day_bucket.handled_count += 1
            if has_sla_context:
                day_bucket.sla_denom += 1
                day_bucket.weighted_denom += ticket.risk_score
                if (
                    responded_at <= ticket.response_deadline_at
                    and completion_at <= ticket.resolution_deadline_at
                ):
                    day_bucket.sla_pass += 1
                    day_bucket.weighted_pass += ticket.risk_score

    avg_response_seconds = (
        _round_optional(response_total_seconds / response_count)
        if response_count > 0
        else None
    )
    avg_resolution_seconds = (
        _round_optional(resolution_total_seconds / resolution_count)
        if resolution_count > 0
        else None
    )
    sla_attainment_rate = _safe_ratio(sla_pass, sla_denom)
    weighted_sla_attainment_rate = _safe_ratio(weighted_sla_pass, weighted_sla_denom)

    summary = {
        "handled_count": handled_count,
        "avg_response_seconds": avg_response_seconds,
        "avg_resolution_seconds": avg_resolution_seconds,
        "sla_attainment_rate": _round_optional(sla_attainment_rate * 100 if sla_attainment_rate is not None else None),
        "weighted_sla_attainment_rate": _round_optional(
            weighted_sla_attainment_rate * 100
            if weighted_sla_attainment_rate is not None
            else None
        ),
    }

    trend: list[dict[str, object]] = []
    if include_trend:
        for day in _iter_days(window.start_day, window.end_day):
            day_bucket = daily.get(day, _DailyAccumulator())
            day_sla_rate = _safe_ratio(day_bucket.sla_pass, day_bucket.sla_denom)
            day_weighted_rate = _safe_ratio(day_bucket.weighted_pass, day_bucket.weighted_denom)
            trend.append(
                {
                    "date": day.isoformat(),
                    "handled_count": day_bucket.handled_count,
                    "sla_attainment_rate": _round_optional(day_sla_rate * 100 if day_sla_rate is not None else None),
                    "weighted_sla_attainment_rate": _round_optional(
                        day_weighted_rate * 100 if day_weighted_rate is not None else None
                    ),
                }
            )

    return summary, trend


def _to_overview_block(tickets: list[Ticket], *, window: WindowContext) -> dict[str, object]:
    summary, trend = _aggregate_metrics(tickets, window=window, include_trend=True)
    return {
        "summary": summary,
        "trend": trend,
    }


def _sort_user_items(
    items: list[dict[str, object]],
    *,
    sort_by: str,
    sort_dir: str,
) -> list[dict[str, object]]:
    descending = sort_dir == "desc"

    def _cmp(a: dict[str, object], b: dict[str, object]) -> int:
        left = a.get(sort_by)
        right = b.get(sort_by)

        if left is None and right is None:
            return 0
        if left is None:
            return 1
        if right is None:
            return -1

        if isinstance(left, str) and isinstance(right, str):
            left_value = left.lower()
            right_value = right.lower()
        else:
            left_value = left
            right_value = right

        result = (left_value > right_value) - (left_value < right_value)
        return -result if descending else result

    return sorted(items, key=cmp_to_key(_cmp))


def get_kpi_overview(
    db: Session,
    actor: ActorContext,
    *,
    window_days: int,
) -> dict[str, object]:
    _require_overview_access(actor)
    window = _resolve_window(window_days)

    personal_tickets = _load_relevant_tickets(
        db,
        assignee_user_ids={actor.user_id},
        window=window,
    )
    personal_payload = _to_overview_block(personal_tickets, window=window)

    global_payload: dict[str, object] | None = None
    if actor.active_role == RoleCode.ADMIN.value:
        internal_users = _load_internal_users(db)
        user_ids = {str(item["user_id"]) for item in internal_users}
        global_tickets = _load_relevant_tickets(
            db,
            assignee_user_ids=user_ids,
            window=window,
        )
        global_payload = _to_overview_block(global_tickets, window=window)

    return {
        "window_days": window.window_days,
        "date_from": window.window_start,
        "date_to": window.window_end,
        "personal": personal_payload,
        "global": global_payload,
    }


def list_kpi_users(
    db: Session,
    actor: ActorContext,
    *,
    window_days: int,
    search: str | None,
    role_code: str | None,
    sort_by: str,
    sort_dir: str,
    limit: int,
    offset: int,
) -> dict[str, object]:
    _require_admin_access(actor)
    window = _resolve_window(window_days)

    normalized_search = _normalize_optional_text(search)
    normalized_role_code = _normalize_role_filter(role_code)
    normalized_sort_by, normalized_sort_dir = _normalize_sort(sort_by, sort_dir)

    all_internal_users = _load_internal_users(db)
    total_count = len(all_internal_users)

    filtered_users = all_internal_users
    if normalized_search:
        keyword = normalized_search.lower()
        filtered_users = [
            item
            for item in filtered_users
            if keyword in str(item["username"]).lower()
            or keyword in str(item["display_name"]).lower()
        ]

    if normalized_role_code:
        filtered_users = [
            item
            for item in filtered_users
            if normalized_role_code in list(item["roles"])
        ]

    filtered_count = len(filtered_users)
    filtered_user_ids = {str(item["user_id"]) for item in filtered_users}
    tickets = _load_relevant_tickets(
        db,
        assignee_user_ids=filtered_user_ids,
        window=window,
    )

    tickets_by_user_id: dict[str, list[Ticket]] = {}
    for ticket in tickets:
        if ticket.assigned_to_user_id is None:
            continue
        tickets_by_user_id.setdefault(ticket.assigned_to_user_id, []).append(ticket)

    items: list[dict[str, object]] = []
    for user in filtered_users:
        user_id = str(user["user_id"])
        summary, _ = _aggregate_metrics(
            tickets_by_user_id.get(user_id, []),
            window=window,
            include_trend=False,
        )
        items.append(
            {
                "user_id": user_id,
                "username": user["username"],
                "display_name": user["display_name"],
                "highest_role_code": user["highest_role_code"],
                "roles": list(user["roles"]),
                **summary,
            }
        )

    items = _sort_user_items(
        items,
        sort_by=normalized_sort_by,
        sort_dir=normalized_sort_dir,
    )

    paged_items = items[offset : offset + limit]
    next_offset = offset + len(paged_items)
    has_more = next_offset < filtered_count

    return {
        "items": paged_items,
        "total_count": total_count,
        "filtered_count": filtered_count,
        "has_more": has_more,
        "next_offset": next_offset if has_more else None,
    }
