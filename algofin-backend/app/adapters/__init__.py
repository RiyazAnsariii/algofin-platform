# app/adapters/__init__.py
# AlgoFin v2 — Phase M: Infrastructure adapters
#
# Adapters are concrete implementations of Ports (app/ports/).
# They contain infrastructure code (Redis, SQLAlchemy) and NOTHING else.
# Domain logic belongs in services, not here.
#
# Switching a transport (e.g. Redis → Kafka) means replacing an adapter.
# Zero domain service code changes required.
