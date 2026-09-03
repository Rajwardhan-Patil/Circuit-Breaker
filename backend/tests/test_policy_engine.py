import pytest
from datetime import datetime
import json
from backend.policy_engine import evaluate

@pytest.fixture
def base_policy():
    return {
        "status": "ACTIVE",
        "per_transaction_limit": 200000,   # ₹2,000 in paise
        "daily_budget": 1000000,           # ₹10,000 in paise
        "allowed_categories": ["groceries", "subscriptions"],
        "blocked_categories": ["gambling", "crypto"],
        "active_window_start": "09:00",
        "active_window_end": "21:00"
    }

def test_killed_agent(base_policy):
    base_policy["status"] = "KILLED"
    tx = {"amount": 80000, "category": "groceries", "merchant": "FreshMart"}
    res = evaluate(base_policy, tx, daily_spent=0)
    assert res["decision"] == "BLOCKED"
    assert "agent is KILLED" in res["reason"]

def test_paused_agent(base_policy):
    base_policy["status"] = "PAUSED"
    tx = {"amount": 80000, "category": "groceries", "merchant": "FreshMart"}
    res = evaluate(base_policy, tx, daily_spent=0)
    assert res["decision"] == "BLOCKED"
    assert "agent is PAUSED" in res["reason"]

def test_blocked_category(base_policy):
    tx = {"amount": 70000, "category": "gambling", "merchant": "Casino"}
    res = evaluate(base_policy, tx, daily_spent=0)
    assert res["decision"] == "BLOCKED"
    assert "category 'gambling' is not permitted" in res["reason"]

def test_disallowed_category(base_policy):
    tx = {"amount": 50000, "category": "electronics", "merchant": "TechShop"}
    res = evaluate(base_policy, tx, daily_spent=0)
    assert res["decision"] == "BLOCKED"
    assert "category 'electronics' is not in allowed list" in res["reason"]

def test_transaction_limit(base_policy):
    tx = {"amount": 500000, "category": "groceries", "merchant": "Amazon"}
    res = evaluate(base_policy, tx, daily_spent=0)
    assert res["decision"] == "BLOCKED"
    assert "exceeds per-transaction limit" in res["reason"]

def test_daily_budget(base_policy):
    tx = {"amount": 50000, "category": "groceries", "merchant": "FreshMart"}
    # Already spent 9,700 rupees (970,000 paise). Budget is 10,000 rupees (1,000,000 paise).
    res = evaluate(base_policy, tx, daily_spent=970000)
    assert res["decision"] == "BLOCKED"
    assert "would exceed daily budget" in res["reason"]

def test_time_window(base_policy):
    tx = {"amount": 80000, "category": "groceries", "merchant": "FreshMart"}
    late_night = datetime(2026, 9, 3, 22, 30, 0)
    res = evaluate(base_policy, tx, daily_spent=0, current_time=late_night)
    assert res["decision"] == "BLOCKED"
    assert "outside allowed active window" in res["reason"]

def test_valid_transaction(base_policy):
    tx = {"amount": 80000, "category": "groceries", "merchant": "FreshMart"}
    midday = datetime(2026, 9, 3, 14, 0, 0)
    res = evaluate(base_policy, tx, daily_spent=0, current_time=midday)
    assert res["decision"] == "ALLOWED"
    assert res["reason"] == "transaction permitted by policy"
