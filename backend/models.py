from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import json
from .database import Base

def utcnow():
    return datetime.now(timezone.utc)

class Agent(Base):
    __tablename__ = "agents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    api_key = Column(String(100), unique=True, nullable=False)
    created_at = Column(DateTime, default=utcnow)

    policy = relationship("Policy", back_populates="agent", uselist=False, cascade="all, delete-orphan")
    policy_history = relationship("PolicyHistory", back_populates="agent", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="agent", cascade="all, delete-orphan")
    audit_events = relationship("AuditEvent", back_populates="agent", cascade="all, delete-orphan")

class Policy(Base):
    __tablename__ = "policies"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), unique=True, nullable=False)
    per_transaction_limit = Column(Integer, nullable=False, default=200000)  # in paise (₹2,000)
    daily_budget = Column(Integer, nullable=False, default=1000000)          # in paise (₹10,000)
    allowed_categories = Column(Text, nullable=False, default='["groceries", "subscriptions"]')  # JSON list
    blocked_categories = Column(Text, nullable=False, default='["gambling", "crypto"]')        # JSON list
    active_window_start = Column(String(5), nullable=True, default="09:00")
    active_window_end = Column(String(5), nullable=True, default="21:00")
    status = Column(String(20), nullable=False, default="ACTIVE")  # ACTIVE, KILLED, PAUSED
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    agent = relationship("Agent", back_populates="policy")

    def get_allowed_categories(self):
        try:
            return json.loads(self.allowed_categories) if self.allowed_categories else []
        except Exception:
            return []

    def get_blocked_categories(self):
        try:
            return json.loads(self.blocked_categories) if self.blocked_categories else []
        except Exception:
            return []

class PolicyHistory(Base):
    __tablename__ = "policy_history"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), nullable=False)
    version = Column(Integer, nullable=False)
    per_transaction_limit = Column(Integer, nullable=False)
    daily_budget = Column(Integer, nullable=False)
    allowed_categories = Column(Text, nullable=False)
    blocked_categories = Column(Text, nullable=False)
    active_window_start = Column(String(5), nullable=True)
    active_window_end = Column(String(5), nullable=True)
    status = Column(String(20), nullable=False)
    created_at = Column(DateTime, default=utcnow)

    agent = relationship("Agent", back_populates="policy_history")

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), nullable=False)
    amount = Column(Integer, nullable=False)  # in paise
    category = Column(String(100), nullable=False)
    merchant = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=utcnow)
    decision = Column(String(20), nullable=False)  # ALLOWED, BLOCKED
    reason = Column(Text, nullable=False)
    razorpay_order_id = Column(String(100), nullable=True)

    agent = relationship("Agent", back_populates="transactions")

class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), nullable=False)
    event_type = Column(String(50), nullable=False)  # POLICY_CHANGED, KILL_SWITCH_TOGGLED, TX_EVALUATED
    actor = Column(String(20), nullable=False)       # human, system
    timestamp = Column(DateTime, default=utcnow)
    detail = Column(Text, nullable=False)

    agent = relationship("Agent", back_populates="audit_events")
