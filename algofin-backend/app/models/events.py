# app/models/events.py
# Re-export EconomicEvent from app.models.economic_event for backward compatibility

from app.models.economic_event import EconomicEvent

__all__ = ["EconomicEvent"]
