from datetime import datetime, timezone
import json

def format_rupees(paise: int) -> str:
    rupees = paise / 100
    if rupees.is_integer():
        return f"₹{int(rupees):,}"
    return f"₹{rupees:,.2f}"

def _parse_categories(raw_val) -> list:
    if not raw_val:
        return []
    if isinstance(raw_val, str):
        try:
            parsed = json.loads(raw_val)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except Exception:
            pass
        return [item.strip() for item in raw_val.split(",") if item.strip()]
    if isinstance(raw_val, list):
        return [str(item).strip() for item in raw_val if str(item).strip()]
    return []

def evaluate(policy, transaction, daily_spent: int, current_time: datetime = None) -> dict:
    """
    Pure policy evaluation engine.
    
    :param policy: Policy object or dictionary containing policy attributes.
    :param transaction: Transaction object or dictionary containing tx details (amount, category, merchant).
    :param daily_spent: Total amount already spent today in paise for ALLOWED transactions.
    :param current_time: Datetime object for active window evaluation (defaults to current UTC time).
    :return: dict with 'decision' ("ALLOWED" | "BLOCKED") and 'reason' (human readable message).
    """
    # Helper getters for dictionary/object duality
    def get_val(obj, key, default=None):
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    # Extract policy fields
    status = get_val(policy, "status", "ACTIVE")
    per_tx_limit = get_val(policy, "per_transaction_limit", 200000)
    daily_budget = get_val(policy, "daily_budget", 1000000)
    window_start = get_val(policy, "active_window_start")
    window_end = get_val(policy, "active_window_end")

    # Extract categories and sanitize
    blocked_categories = [c for c in _parse_categories(get_val(policy, "blocked_categories", [])) if c.lower() != "string"]
    allowed_categories = [c for c in _parse_categories(get_val(policy, "allowed_categories", [])) if c.lower() != "string"]

    # Extract transaction fields
    amount = get_val(transaction, "amount", 0)
    category = get_val(transaction, "category", "")
    req_cat = category.strip().lower()

    # Rule 1: Agent Status
    if status == "KILLED":
        return {
            "decision": "BLOCKED",
            "reason": "agent is KILLED"
        }
    if status == "PAUSED":
        return {
            "decision": "BLOCKED",
            "reason": "agent is PAUSED"
        }

    # Rule 2: Blocked Category
    if req_cat in [c.lower() for c in blocked_categories]:
        return {
            "decision": "BLOCKED",
            "reason": f"category '{category}' is not permitted"
        }

    # Rule 3: Allowed Category
    if allowed_categories:
        if req_cat not in [c.lower() for c in allowed_categories]:
            return {
                "decision": "BLOCKED",
                "reason": f"category '{category}' is not in allowed list"
            }

    # Rule 4: Transaction Limit
    if amount > per_tx_limit:
        return {
            "decision": "BLOCKED",
            "reason": f"amount exceeds per-transaction limit of {format_rupees(per_tx_limit)}"
        }

    # Rule 5: Daily Budget
    daily_spent_int = int(daily_spent or 0)
    amount_int = int(amount or 0)
    daily_budget_int = int(daily_budget or 0)
    if daily_spent_int + amount_int > daily_budget_int:
        return {
            "decision": "BLOCKED",
            "reason": f"would exceed daily budget of {format_rupees(daily_budget_int)} (already spent {format_rupees(daily_spent_int)} today)"
        }

    # Rule 6: Active Time Window
    if window_start and window_end:
        now = current_time or datetime.now()
        now_time_str = now.strftime("%H:%M")
        
        in_window = True
        if window_start <= window_end:
            in_window = window_start <= now_time_str <= window_end
        else:
            # Window spans midnight (e.g. 22:00 to 06:00)
            in_window = now_time_str >= window_start or now_time_str <= window_end

        if not in_window:
            return {
                "decision": "BLOCKED",
                "reason": f"outside allowed active window ({window_start}–{window_end})"
            }

    # Rule 7: Allow
    return {
        "decision": "ALLOWED",
        "reason": "transaction permitted by policy"
    }
