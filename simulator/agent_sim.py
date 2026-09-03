import argparse
import requests
import time
import sys
import random

DEFAULT_URL = "http://127.0.0.1:8000"

SCENARIOS = {
    "normal": [
        {"amount": 80000, "category": "groceries", "merchant": "FreshMart"}
    ],
    "over-limit": [
        {"amount": 500000, "category": "groceries", "merchant": "Amazon"}
    ],
    "blocked-category": [
        {"amount": 70000, "category": "gambling", "merchant": "Casino"}
    ],
    "loop": [
        {"amount": 80000, "category": "groceries", "merchant": "FreshMart"},
        {"amount": 500000, "category": "groceries", "merchant": "Amazon"},
        {"amount": 70000, "category": "gambling", "merchant": "Casino"},
        {"amount": 50000, "category": "groceries", "merchant": "Zepto"},
        {"amount": 120000, "category": "subscriptions", "merchant": "Netflix"},
        {"amount": 150000, "category": "crypto", "merchant": "CoinSwitch"},
        {"amount": 350000, "category": "subscriptions", "merchant": "AWS Cloud"},
    ]
}

def send_transaction(base_url: str, agent_id: int, tx: dict):
    endpoint = f"{base_url.rstrip('/')}/agents/{agent_id}/transact"
    rupees = tx["amount"] / 100
    print(f"\n[AGENT REQUEST] Attempting transaction: ₹{rupees:,.2f} | Category: '{tx['category']}' | Merchant: '{tx['merchant']}'")
    
    try:
        start_time = time.time()
        res = requests.post(endpoint, json=tx, timeout=5)
        elapsed = (time.time() - start_time) * 1000
        
        if res.status_code == 200:
            data = res.json()
            decision = data.get("decision")
            reason = data.get("reason")
            order_id = data.get("razorpay_order_id")
            
            if decision == "ALLOWED":
                print(f"  🟢 [RESPONSE {elapsed:.1f}ms] DECISION: ALLOWED")
                print(f"     Reason: {reason}")
                print(f"     Razorpay Order ID: {order_id}")
            else:
                print(f"  🔴 [RESPONSE {elapsed:.1f}ms] DECISION: BLOCKED")
                print(f"     Reason: {reason}")
        else:
            print(f"  ❌ HTTP Error {res.status_code}: {res.text}")
    except requests.exceptions.RequestException as e:
        print(f"  ❌ Failed to connect to CircuitBreaker server at {base_url}: {e}")

def main():
    parser = argparse.ArgumentParser(description="CircuitBreaker AI Agent Simulator")
    parser.add_argument("--agent-id", type=int, default=1, help="Agent ID to transact for (default: 1)")
    parser.add_argument("--scenario", type=str, default="normal", choices=["normal", "over-limit", "blocked-category", "loop"], help="Scenario to execute")
    parser.add_argument("--url", type=str, default=DEFAULT_URL, help="Base URL of CircuitBreaker API")
    parser.add_argument("--interval", type=float, default=3.0, help="Interval between requests in seconds for 'loop' mode")

    args = parser.parse_args()

    print("=" * 60)
    print("🤖 CIRCUITBREAKER AI AGENT SIMULATOR")
    print(f"Target Server: {args.url}")
    print(f"Agent ID: {args.agent_id}")
    print(f"Scenario: {args.scenario}")
    print("=" * 60)

    if args.scenario == "loop":
        print(f"Starting continuous transaction loop (interval: {args.interval}s). Press Ctrl+C to stop.\n")
        items = SCENARIOS["loop"]
        idx = 0
        try:
            while True:
                tx = items[idx % len(items)]
                send_transaction(args.url, args.agent_id, tx)
                idx += 1
                time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\n[SIMULATOR] Stopped by user.")
    else:
        tx_list = SCENARIOS[args.scenario]
        for tx in tx_list:
            send_transaction(args.url, args.agent_id, tx)

if __name__ == "__main__":
    main()
