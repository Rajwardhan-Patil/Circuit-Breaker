import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import json

from backend.database import Base, get_db
from backend.main import app
from backend.models import Agent, Policy, Transaction
from backend.ai_service import TransactionIntent, parse_intent_from_text, AIIntentError

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
        per_transaction_limit=200000,   # ₹2,000 limit
        daily_budget=1000000,           # ₹10,000 budget
        allowed_categories=json.dumps(["groceries", "subscriptions"]),
        blocked_categories=json.dumps(["gambling", "crypto"]),
        active_window_start="00:00",
        active_window_end="23:59",
        status="ACTIVE"
    )
    db.add(policy)
    db.commit()
    db.close()
    yield

# 1. Test parsing raw text output to TransactionIntent model
def test_parse_intent_from_text_valid():
    raw_json = '{"amount": 1500, "currency": "INR", "category": "groceries", "merchant": "FreshMart", "reason": "Purchase groceries"}'
    intent = parse_intent_from_text(raw_json)
    assert intent.amount == 1500
    assert intent.category == "groceries"
    assert intent.merchant == "FreshMart"

def test_parse_intent_from_text_markdown_codeblock():
    raw_json = '```json\n{"amount": 800, "currency": "INR", "category": "groceries", "merchant": null, "reason": "Buy groceries"}\n```'
    intent = parse_intent_from_text(raw_json)
    assert intent.amount == 800
    assert intent.category == "groceries"
    assert intent.merchant is None

# 2. Test missing amount does not result in a payment attempt
@patch("backend.main.parse_intent")
def test_missing_amount_rejects_payment(mock_parse):
    mock_parse.return_value = TransactionIntent(
        amount=None,
        currency="INR",
        category="groceries",
        merchant=None,
        reason="Buy groceries"
    )

    with TestClient(app) as client:
        response = client.post("/agents/1/intent", json={"message": "Buy some groceries"})
        assert response.status_code == 400
        assert "Unable to understand transaction intent" in response.json()["detail"]

# 3. Test invalid AI output / AI failure is rejected safely
@patch("backend.main.parse_intent")
def test_ai_failure_rejected_safely(mock_parse):
    mock_parse.side_effect = AIIntentError("Unable to understand transaction intent. AI provider is not configured.")

    with TestClient(app) as client:
        response = client.post("/agents/1/intent", json={"message": "Buy groceries for ₹800"})
        assert response.status_code == 400
        assert "Unable to understand transaction intent" in response.json()["detail"]

# 4. Test Scenario A: Valid intent -> ALLOWED policy decision + Razorpay order
@patch("backend.main.parse_intent")
def test_intent_allowed_scenario_a(mock_parse):
    mock_parse.return_value = TransactionIntent(
        amount=800,
        currency="INR",
        category="groceries",
        merchant=None,
        reason="Buy groceries for 800 rupees"
    )

    with TestClient(app) as client:
        response = client.post("/agents/1/intent", json={"message": "Buy groceries for ₹800"})
        assert response.status_code == 200
        data = response.json()

        assert data["intent"]["amount"] == 800
        assert data["intent"]["category"] == "groceries"
        assert data["decision"]["status"] == "ALLOWED"
        assert data["razorpay_order_id"] is not None
        assert data["razorpay_order_id"].startswith("order_")

# 5. Test Scenario B: AI Intent over transaction limit -> BLOCKED by policy
@patch("backend.main.parse_intent")
def test_intent_over_limit_scenario_b(mock_parse):
    mock_parse.return_value = TransactionIntent(
        amount=5000,
        currency="INR",
        category="groceries",
        merchant=None,
        reason="Buy groceries for 5000 rupees"
    )

    with TestClient(app) as client:
        response = client.post("/agents/1/intent", json={"message": "Buy groceries for ₹5000"})
        assert response.status_code == 200
        data = response.json()

        assert data["intent"]["amount"] == 5000
        assert data["decision"]["status"] == "BLOCKED"
        assert "exceeds per-transaction limit" in data["decision"]["reason"]
        assert data["razorpay_order_id"] is None

# 6. Test Scenario C: AI Intent for blocked category -> BLOCKED by policy
@patch("backend.main.parse_intent")
def test_intent_blocked_category_scenario_c(mock_parse):
    mock_parse.return_value = TransactionIntent(
        amount=500,
        currency="INR",
        category="gambling",
        merchant=None,
        reason="Gambling website transaction"
    )

    with TestClient(app) as client:
        response = client.post("/agents/1/intent", json={"message": "Buy something from a gambling website for ₹500"})
        assert response.status_code == 200
        data = response.json()

        assert data["intent"]["category"] == "gambling"
        assert data["decision"]["status"] == "BLOCKED"
        assert "category 'gambling' is not permitted" in data["decision"]["reason"]
        assert data["razorpay_order_id"] is None

# 7. Test Scenario D: AI Intent respects Kill Switch -> BLOCKED when agent is KILLED
@patch("backend.main.parse_intent")
def test_intent_respects_kill_switch_scenario_d(mock_parse):
    mock_parse.return_value = TransactionIntent(
        amount=1200,
        currency="INR",
        category="groceries",
        merchant=None,
        reason="Purchase headphones"
    )

    with TestClient(app) as client:
        # Kill agent first
        kill_res = client.post("/agents/1/kill")
        assert kill_res.status_code == 200
        assert kill_res.json()["status"] == "KILLED"

        # Submit valid AI intent
        response = client.post("/agents/1/intent", json={"message": "Buy headphones for ₹1200"})
        assert response.status_code == 200
        data = response.json()

        assert data["decision"]["status"] == "BLOCKED"
        assert "agent is KILLED" in data["decision"]["reason"]
        assert data["razorpay_order_id"] is None
