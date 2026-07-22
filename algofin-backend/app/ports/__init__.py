# app/ports/__init__.py
# AlgoFin v2 — Phase M: Port definitions
#
# Ports are the architectural boundary between the domain core and infrastructure.
# All domain services depend on these interfaces, never on concrete infrastructure
# (no sqlalchemy, redis, ccxt, or httpx imports inside domain services).
#
# Architectural Principle 2 (Infrastructure Independence):
#   No domain service imports infrastructure libraries directly.
#   All infrastructure access is through ports defined here.

from app.ports.repositories import (
    StrategyReadModel,
    SignalReadModel,
    StrategyRepository,
    SignalRepository,
    SecretRepository,
    VersionRepository,
    ExecutionRepository,
    AuditPort,
)
from app.ports.queue import QueuePort, QueueMessage
from app.ports.signal_source import SignalSourcePort, SignalPayload

__all__ = [
    # Read models (data that crosses bounded context boundaries)
    "StrategyReadModel",
    "SignalReadModel",
    # Repository ports
    "StrategyRepository",
    "SignalRepository",
    "SecretRepository",
    "VersionRepository",
    "ExecutionRepository",
    "AuditPort",
    # Queue port
    "QueuePort",
    "QueueMessage",
    # Signal source port
    "SignalSourcePort",
    "SignalPayload",
]
