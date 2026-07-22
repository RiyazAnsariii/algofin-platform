# app/webhooks/__init__.py
# AlgoFin v2 — Phase M: Webhook engine package
#
# Services in this package form the Signal Ingestion bounded context (BC2):
#   SecretService  — webhook secret lifecycle (generate, rotate, verify)
#   VersionService — Pine Script version history (immutable snapshots)
#   SignalService  — signal receipt, dedup, persistence, status
#
# Application services (ExecutionService, WebhookService/router) also live here.
