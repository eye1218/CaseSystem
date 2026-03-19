from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from app.modules.kpi.service import WindowContext, _aggregate_metrics, _within_window
from app.modules.tickets.models import Ticket


def _build_window(end_at: datetime, *, window_days: int = 30) -> WindowContext:
    end_day = end_at.date()
    start_day = end_day - timedelta(days=window_days - 1)
    return WindowContext(
        window_days=window_days,
        window_start=datetime.combine(start_day, time.min),
        window_end=end_at,
        start_day=start_day,
        end_day=end_day,
    )


def test_within_window_accepts_aware_datetime() -> None:
    aware_now = datetime.now(timezone.utc)
    window = _build_window(aware_now.replace(tzinfo=None))
    assert _within_window(aware_now, window) is True


def test_aggregate_metrics_supports_mixed_naive_and_aware_datetimes() -> None:
    aware_now = datetime.now(timezone.utc)
    created_at = aware_now - timedelta(hours=6)
    responded_at = aware_now - timedelta(hours=4)
    resolved_at = aware_now - timedelta(hours=1)

    ticket = Ticket()
    ticket.id = 1
    ticket.title = "timezone-test-ticket"
    ticket.risk_score = 12
    ticket.created_at = created_at
    ticket.responded_at = responded_at
    ticket.response_deadline_at = (aware_now - timedelta(hours=3)).replace(tzinfo=None)
    ticket.resolved_at = resolved_at
    ticket.closed_at = None
    ticket.resolution_deadline_at = aware_now + timedelta(hours=1)

    window = _build_window(aware_now.replace(tzinfo=None))
    summary, trend = _aggregate_metrics([ticket], window=window, include_trend=True)

    assert summary["handled_count"] == 1
    assert summary["avg_response_seconds"] == 7200.0
    assert summary["avg_resolution_seconds"] == 18000.0
    assert summary["sla_attainment_rate"] == 100.0
    assert summary["weighted_sla_attainment_rate"] == 100.0
    assert len(trend) == 30
