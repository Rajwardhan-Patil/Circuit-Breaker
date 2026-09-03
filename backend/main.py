from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, status, Body
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from typing import List, Optional
import json

from .database import engine, Base, get_db
from .models import Agent, Policy, PolicyHistory, Transaction, AuditEvent, utcnow
from .policy_engine import evaluate
from .razorpay_client import create_razorpay_order
from .ws_manager import ws_manager

# Create tables on startup
Base.metadata.create_all(bind=engine)

# Pydantic Schemas
class CreateAgentRequest(BaseModel):
    name: str

class PolicyUpdateRequest(BaseModel):
    per_transaction_limit: Optional[int] = None
    daily_budget: Optional[int] = None
    allowed_categories: Optional[List[str]] = None
    blocked_categories: Optional[List[str]] = None
    active_window_start: Optional[str] = None
    active_window_end: Optional[str] = None

class TransactRequest(BaseModel):
    amount: int = Field(..., gt=0, description="Amount in paise (e.g. 80000 for ₹800)")
    category: str
    merchant: str

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Seed default agent if table is empty
    db = next(get_db())
    agent = db.query(Agent).filter(Agent.id == 1).first()
    if not agent:
        agent = Agent(id=1, name="ShoppingBot", api_key="sb_key_shoppingbot_123")
        db.add(agent)
        db.commit()
        db.refresh(agent)

        policy = Policy(
            agent_id=agent.id,
            per_transaction_limit=200000,   # ₹2,000
            daily_budget=1000000,           # ₹10,000
            allowed_categories=json.dumps(["groceries", "subscriptions"]),
            blocked_categories=json.dumps(["gambling", "crypto"]),
            active_window_start="09:00",
            active_window_end="21:00",
            status="ACTIVE"
        )
        db.add(policy)
        db.commit()

        history = PolicyHistory(
            agent_id=agent.id,
            version=1,
            per_transaction_limit=policy.per_transaction_limit,
            daily_budget=policy.daily_budget,
            allowed_categories=policy.allowed_categories,
            blocked_categories=policy.blocked_categories,
            active_window_start=policy.active_window_start,
            active_window_end=policy.active_window_end,
            status=policy.status
        )
        db.add(history)

        audit = AuditEvent(
            agent_id=agent.id,
            event_type="POLICY_CHANGED",
            actor="system",
            detail="System initialized default agent 'ShoppingBot' with policy v1"
        )
        db.add(audit)
        db.commit()
    yield

app = FastAPI(
    title="CircuitBreaker API",
    description="Agent Authorization & Payment Policy Enforcement Layer",
    version="1.0.0",
    lifespan=lifespan
)

@app.get("/health")
def health():
    return {"status": "online", "service": "CircuitBreaker Policy Engine"}

@app.post("/agents", status_code=status.HTTP_201_CREATED)
def create_agent(req: CreateAgentRequest = Body(...), db: Session = Depends(get_db)):
    agent = Agent(name=req.name, api_key=f"key_{req.name.lower()}_{int(utcnow().timestamp())}")
    db.add(agent)
    db.commit()
    db.refresh(agent)

    policy = Policy(
        agent_id=agent.id,
        per_transaction_limit=200000,
        daily_budget=1000000,
        allowed_categories=json.dumps(["groceries", "subscriptions"]),
        blocked_categories=json.dumps(["gambling", "crypto"]),
        active_window_start="09:00",
        active_window_end="21:00",
        status="ACTIVE"
    )
    db.add(policy)
    db.commit()

    history = PolicyHistory(
        agent_id=agent.id,
        version=1,
        per_transaction_limit=policy.per_transaction_limit,
        daily_budget=policy.daily_budget,
        allowed_categories=policy.allowed_categories,
        blocked_categories=policy.blocked_categories,
        active_window_start=policy.active_window_start,
        active_window_end=policy.active_window_end,
        status=policy.status
    )
    db.add(history)

    audit = AuditEvent(
        agent_id=agent.id,
        event_type="POLICY_CHANGED",
        actor="system",
        detail=f"Agent '{agent.name}' created with default policy"
    )
    db.add(audit)
    db.commit()

    return {
        "id": agent.id,
        "name": agent.name,
        "api_key": agent.api_key,
        "status": policy.status
    }

@app.get("/agents")
def list_agents(db: Session = Depends(get_db)):
    agents = db.query(Agent).all()
    res = []
    for a in agents:
        pol = a.policy
        res.append({
            "id": a.id,
            "name": a.name,
            "api_key": a.api_key,
            "created_at": a.created_at,
            "status": pol.status if pol else "UNKNOWN",
            "per_transaction_limit": pol.per_transaction_limit if pol else 0,
            "daily_budget": pol.daily_budget if pol else 0,
        })
    return res

@app.get("/agents/{agent_id}")
def get_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    pol = agent.policy
    return {
        "id": agent.id,
        "name": agent.name,
        "api_key": agent.api_key,
        "created_at": agent.created_at,
        "policy": {
            "per_transaction_limit": pol.per_transaction_limit,
            "daily_budget": pol.daily_budget,
            "allowed_categories": pol.get_allowed_categories(),
            "blocked_categories": pol.get_blocked_categories(),
            "active_window_start": pol.active_window_start,
            "active_window_end": pol.active_window_end,
            "status": pol.status,
            "updated_at": pol.updated_at
        }
    }

@app.get("/agents/{agent_id}/policy")
def get_policy(agent_id: int, db: Session = Depends(get_db)):
    policy = db.query(Policy).filter(Policy.agent_id == agent_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found for agent")
    return {
        "agent_id": agent_id,
        "per_transaction_limit": policy.per_transaction_limit,
        "daily_budget": policy.daily_budget,
        "allowed_categories": policy.get_allowed_categories(),
        "blocked_categories": policy.get_blocked_categories(),
        "active_window_start": policy.active_window_start,
        "active_window_end": policy.active_window_end,
        "status": policy.status,
        "updated_at": policy.updated_at
    }

@app.patch("/agents/{agent_id}/policy")
async def update_policy(agent_id: int, req: PolicyUpdateRequest = Body(...), db: Session = Depends(get_db)):
    policy = db.query(Policy).filter(Policy.agent_id == agent_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    changes = []
    if req.per_transaction_limit is not None:
        changes.append(f"Limit: {policy.per_transaction_limit} -> {req.per_transaction_limit}")
        policy.per_transaction_limit = req.per_transaction_limit
    if req.daily_budget is not None:
        changes.append(f"Budget: {policy.daily_budget} -> {req.daily_budget}")
        policy.daily_budget = req.daily_budget
    if req.allowed_categories is not None:
        changes.append(f"Allowed: {req.allowed_categories}")
        policy.allowed_categories = json.dumps(req.allowed_categories)
    if req.blocked_categories is not None:
        changes.append(f"Blocked: {req.blocked_categories}")
        policy.blocked_categories = json.dumps(req.blocked_categories)
    if req.active_window_start is not None:
        policy.active_window_start = req.active_window_start
    if req.active_window_end is not None:
        policy.active_window_end = req.active_window_end

    policy.updated_at = utcnow()
    db.commit()

    # Create new PolicyHistory snapshot
    last_history = db.query(PolicyHistory).filter(PolicyHistory.agent_id == agent_id).order_by(PolicyHistory.version.desc()).first()
    new_version = (last_history.version + 1) if last_history else 1
    
    history = PolicyHistory(
        agent_id=agent_id,
        version=new_version,
        per_transaction_limit=policy.per_transaction_limit,
        daily_budget=policy.daily_budget,
        allowed_categories=policy.allowed_categories,
        blocked_categories=policy.blocked_categories,
        active_window_start=policy.active_window_start,
        active_window_end=policy.active_window_end,
        status=policy.status
    )
    db.add(history)

    # Audit event
    detail_str = f"Updated policy v{new_version}: " + ", ".join(changes) if changes else f"Policy updated to v{new_version}"
    audit = AuditEvent(
        agent_id=agent_id,
        event_type="POLICY_CHANGED",
        actor="human",
        detail=detail_str
    )
    db.add(audit)
    db.commit()

    policy_data = {
        "agent_id": agent_id,
        "per_transaction_limit": policy.per_transaction_limit,
        "daily_budget": policy.daily_budget,
        "allowed_categories": policy.get_allowed_categories(),
        "blocked_categories": policy.get_blocked_categories(),
        "active_window_start": policy.active_window_start,
        "active_window_end": policy.active_window_end,
        "status": policy.status,
        "version": new_version
    }

    # WS broadcast
    await ws_manager.broadcast(agent_id, {
        "type": "POLICY_UPDATE",
        "policy": policy_data
    })

    return policy_data

@app.post("/agents/{agent_id}/kill")
async def kill_agent(agent_id: int, db: Session = Depends(get_db)):
    policy = db.query(Policy).filter(Policy.agent_id == agent_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    policy.status = "KILLED"
    policy.updated_at = utcnow()

    audit = AuditEvent(
        agent_id=agent_id,
        event_type="KILL_SWITCH_TOGGLED",
        actor="human",
        detail="Kill switch activated by operator - agent authority revoked"
    )
    db.add(audit)
    db.commit()

    # WS broadcast
    await ws_manager.broadcast(agent_id, {
        "type": "KILL_SWITCH",
        "status": "KILLED",
        "timestamp": utcnow().isoformat()
    })

    return {"agent_id": agent_id, "status": "KILLED", "message": "Agent killed successfully"}

@app.post("/agents/{agent_id}/resume")
async def resume_agent(agent_id: int, db: Session = Depends(get_db)):
    policy = db.query(Policy).filter(Policy.agent_id == agent_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    policy.status = "ACTIVE"
    policy.updated_at = utcnow()

    audit = AuditEvent(
        agent_id=agent_id,
        event_type="KILL_SWITCH_TOGGLED",
        actor="human",
        detail="Kill switch disengaged by operator - agent authority restored"
    )
    db.add(audit)
    db.commit()

    # WS broadcast
    await ws_manager.broadcast(agent_id, {
        "type": "KILL_SWITCH",
        "status": "ACTIVE",
        "timestamp": utcnow().isoformat()
    })

    return {"agent_id": agent_id, "status": "ACTIVE", "message": "Agent resumed successfully"}

@app.post("/agents/{agent_id}/transact")
async def transact(agent_id: int, req: TransactRequest = Body(...), db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    policy = db.query(Policy).filter(Policy.agent_id == agent_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found for agent")

    # Calculate today's spent amount for ALLOWED transactions
    today_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    daily_spent = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.agent_id == agent_id,
        Transaction.decision == "ALLOWED",
        Transaction.timestamp >= today_start
    ).scalar()

    # Evaluate policy
    eval_result = evaluate(policy, req, int(daily_spent))

    decision = eval_result["decision"]
    reason = eval_result["reason"]
    razorpay_order_id = None

    # Call Razorpay ONLY if ALLOWED
    if decision == "ALLOWED":
        try:
            razorpay_order_id = create_razorpay_order(req.amount, req.merchant)
        except Exception as e:
            # If Razorpay fails, transaction fails
            decision = "BLOCKED"
            reason = f"Razorpay API Error: {str(e)}"

    # Record Transaction
    tx = Transaction(
        agent_id=agent_id,
        amount=req.amount,
        category=req.category,
        merchant=req.merchant,
        timestamp=utcnow(),
        decision=decision,
        reason=reason,
        razorpay_order_id=razorpay_order_id
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)

    # Record AuditEvent
    audit = AuditEvent(
        agent_id=agent_id,
        event_type="TX_EVALUATED",
        actor="system",
        detail=f"Transaction evaluated: {decision} - {reason} ({req.category}, {req.merchant}, paise: {req.amount})"
    )
    db.add(audit)
    db.commit()

    tx_data = {
        "id": tx.id,
        "agent_id": agent_id,
        "amount": tx.amount,
        "category": tx.category,
        "merchant": tx.merchant,
        "timestamp": tx.timestamp.isoformat(),
        "decision": tx.decision,
        "reason": tx.reason,
        "razorpay_order_id": tx.razorpay_order_id
    }

    # Broadcast via WebSocket
    await ws_manager.broadcast(agent_id, {
        "type": "TRANSACTION",
        "transaction": tx_data
    })

    return tx_data

@app.get("/agents/{agent_id}/audit")
def get_audit_log(agent_id: int, limit: int = 50, db: Session = Depends(get_db)):
    events = db.query(AuditEvent).filter(AuditEvent.agent_id == agent_id).order_by(AuditEvent.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": e.id,
            "agent_id": e.agent_id,
            "event_type": e.event_type,
            "actor": e.actor,
            "timestamp": e.timestamp.isoformat(),
            "detail": e.detail
        }
        for e in events
    ]

@app.get("/agents/{agent_id}/transactions")
def get_transactions(agent_id: int, limit: int = 50, db: Session = Depends(get_db)):
    txs = db.query(Transaction).filter(Transaction.agent_id == agent_id).order_by(Transaction.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": t.id,
            "agent_id": t.agent_id,
            "amount": t.amount,
            "category": t.category,
            "merchant": t.merchant,
            "timestamp": t.timestamp.isoformat(),
            "decision": t.decision,
            "reason": t.reason,
            "razorpay_order_id": t.razorpay_order_id
        }
        for t in txs
    ]

@app.websocket("/ws/agents/{agent_id}")
async def websocket_endpoint(websocket: WebSocket, agent_id: int):
    await ws_manager.connect(websocket, agent_id)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, agent_id)
