import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import json

from backend.database import Base, get_db
from backend.main import app
from backend.models import Agent, Policy, PolicyHistory, AuditEvent

SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///./test_circuitbreaker.db"

engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db = TestingSessionLocal()
    agent = Agent(id=1, name="ShoppingBot", api_key="sb_key_test_123")
    db.add(agent)
    db.commit()

    policy = Policy(
        agent_id=1,
        per_transaction_limit=200000,   # ₹2,000
        daily_budget=1000000,           # ₹10,000
        allowed_categories=json.dumps(["groceries", "subscriptions"]),
        blocked_categories=json.dumps(["gambling", "crypto"]),
        active_window_start="00:00",    # All day for testing
        active_window_end="23:59",
        status="ACTIVE"
    )
    db.add(policy)
    db.commit()
    db.close()
    yield

def test_health():
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "online"

def test_get_agent():
    with TestClient(app) as client:
        response = client.get("/agents/1")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == 1
        assert data["name"] == "ShoppingBot"
        assert "policy" in data

def test_transact_allowed():
    with TestClient(app) as client:
        payload = {
            "amount": 80000,
            "category": "groceries",
            "merchant": "FreshMart"
        }
        response = client.post("/agents/1/transact", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["decision"] == "ALLOWED"
        assert data["razorpay_order_id"] is not None
        assert data["razorpay_order_id"].startswith("order_")

def test_transact_blocked_amount():
    with TestClient(app) as client:
        payload = {
            "amount": 500000,
            "category": "groceries",
            "merchant": "Amazon"
        }
        response = client.post("/agents/1/transact", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["decision"] == "BLOCKED"
        assert "exceeds per-transaction limit" in data["reason"]

def test_kill_and_resume_switch():
    with TestClient(app) as client:
        response = client.post("/agents/1/kill")
        assert response.status_code == 200
        assert response.json()["status"] == "KILLED"

        payload = {"amount": 50000, "category": "groceries", "merchant": "FreshMart"}
        tx_res = client.post("/agents/1/transact", json=payload)
        assert tx_res.status_code == 200
        assert tx_res.json()["decision"] == "BLOCKED"
        assert "agent is KILLED" in tx_res.json()["reason"]

        res_response = client.post("/agents/1/resume")
        assert res_response.status_code == 200
        assert res_response.json()["status"] == "ACTIVE"

def test_daily_budget_exceeded_api():
    with TestClient(app) as client:
        # Set daily_budget to ₹2,500 (250,000 paise)
        pol_res = client.patch("/agents/1/policy", json={"daily_budget": 250000})
        assert pol_res.status_code == 200

        # Tx 1: ₹1,500 (150,000 paise) -> ALLOWED
        tx1 = client.post("/agents/1/transact", json={"amount": 150000, "category": "groceries", "merchant": "Store A"})
        assert tx1.status_code == 200
        assert tx1.json()["decision"] == "ALLOWED"

        # Tx 2: ₹1,500 (150,000 paise) -> Cumulative ₹3,000 > ₹2,500 daily budget -> BLOCKED
        tx2 = client.post("/agents/1/transact", json={"amount": 150000, "category": "groceries", "merchant": "Store B"})
        assert tx2.status_code == 200
        assert tx2.json()["decision"] == "BLOCKED"
        assert "would exceed daily budget" in tx2.json()["reason"]
