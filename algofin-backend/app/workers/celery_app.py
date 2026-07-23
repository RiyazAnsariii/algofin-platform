# app/workers/celery_app.py
# AlgoFin v1 — Celery application and schedule

from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "algofin",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.workers.sync_tasks",
        "app.workers.billing_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.workers.sync_tasks.*": {"queue": "sync"},
        "app.workers.billing_tasks.*": {"queue": "default"},
    },
)

# ── Periodic sync schedule ────────────────────────────────────────
celery_app.conf.beat_schedule = {
    # Sync balances every 10 minutes
    "sync-all-balances": {
        "task": "app.workers.sync_tasks.sync_all_accounts",
        "schedule": settings.sync_balances_interval_minutes * 60,
        "args": ["balances"],
        "options": {"queue": "sync"},
    },
    # Sync positions every 5 minutes
    "sync-all-positions": {
        "task": "app.workers.sync_tasks.sync_all_accounts",
        "schedule": settings.sync_positions_interval_minutes * 60,
        "args": ["positions"],
        "options": {"queue": "sync"},
    },
    # Sync trades every 20 minutes
    "sync-all-trades": {
        "task": "app.workers.sync_tasks.sync_all_accounts",
        "schedule": settings.sync_trades_interval_minutes * 60,
        "args": ["trades"],
        "options": {"queue": "sync"},
    },
    # Billing period refresh — daily at 00:05 UTC
    "refresh-billing-periods": {
        "task": "app.workers.billing_tasks.refresh_all_billing_periods",
        "schedule": crontab(hour=0, minute=5),
        "options": {"queue": "default"},
    },
}
