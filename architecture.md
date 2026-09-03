# CircuitBreaker Architecture & Technical Documentation

**Agent Authorization & Payment Policy Enforcement Layer**  
*Razorpay AI Buildathon 2026 · Open Track*

---

## 1. Executive Summary

### The Core Problem

Autonomous AI agents are shifting from answering text prompts to taking real-world financial actions on behalf of humans (e.g., booking flights, buying supplies, subscribing to cloud services, trading assets). Traditional payment rails assume an active human operator is present at the point of checkout to inspect and approve the payment decision.

When an AI agent acts autonomously, four critical control problems emerge:
1. **Category Risk**: How do we prevent an agent authorized to buy groceries from purchasing gambling credits, crypto, or unapproved goods?
2. **Budget Risk**: How do we enforce per-transaction spending limits and total daily budgets?
3. **Behavioral Risk**: If an agent starts misbehaving or looping, how can a human instantly revoke its spending authority?
4. **Auditability**: Why was a specific payment permitted or blocked? Who approved the governing rules?

### The CircuitBreaker Solution

**CircuitBreaker is a policy enforcement and authorization layer that sits between an AI Agent and Razorpay.** 

Instead of allowing an AI agent to call the payment API directly, all payment attempts must pass through CircuitBreaker's policy engine. The system evaluates the transaction against active rules in real-time, records an immutable audit log, broadcasts live events over WebSockets to an Operator Dashboard, and only invokes Razorpay to create a payment order if the transaction is **ALLOWED**.

```
                           ┌─────────────────────────┐
                           │        AI AGENT         │
                           │   (Python Simulator)    │
                           └────────────┬────────────┘
                                        │
                                        │ POST /agents/{id}/transact
                                        ▼
                       ┌─────────────────────────────────┐
                       │         CIRCUITBREAKER          │
                       │                                 │
                       │    FastAPI Authorization API    │
                       │                │                │
                       │                ▼                │
                       │      Pure Policy Engine         │
                       │                │                │
                       │         ┌──────┴──────┐         │
                       │         │             │         │
                       │      BLOCKED       ALLOWED      │
                       │         │             │         │
                       │         │             ▼         │
                       │         │         Razorpay      │
                       │         │        Test Mode      │
                       │         │             │         │
                       │         └──────┬──────┘         │
                       │                ▼                │
                       │         SQLite Database         │
                       │                │                │
                       │                ▼                │
                       │        WebSocket Manager        │
                       └────────────────┬────────────────┘
                                        │
                                        │ WebSocket /ws/agents/{id}
                                        ▼
                       ┌─────────────────────────────────┐
                       │       OPERATOR DASHBOARD        │
                       │                                 │
                       │  ● Instant Kill Switch          │
                       │  ● Policy Editor                │
                       │  ● Live Transaction Stream      │
                       │  ● Immutable Audit Trail        │
                       └─────────────────────────────────┘
```

---

## 2. Fundamental Architecture Principles

### Principle 1: Mandatory Gateway Pattern
AI agents never receive Razorpay API credentials directly. All transaction attempts must pass through the CircuitBreaker policy layer.
* **Incorrect**: `Agent ---> Razorpay` (allows bypassing policies)
* **Correct**: `Agent ---> CircuitBreaker ---> Razorpay`

### Principle 2: Pre-Evaluation Gatekeeping
No Razorpay order is created for a blocked transaction. Policy rules are fully evaluated before invoking external payment APIs.
* **BLOCKED**: Transaction recorded $\rightarrow$ Audit event created $\rightarrow$ WebSocket broadcast $\rightarrow$ HTTP response (0 Razorpay API calls).
* **ALLOWED**: Policy passed $\rightarrow$ Razorpay Order Created $\rightarrow$ Transaction recorded $\rightarrow$ Audit event created $\rightarrow$ WebSocket broadcast.

### Principle 3: Deterministic Policy Engine Isolation
The core evaluation logic (`policy_engine.py`) is implemented as a pure function:
```python
evaluate(policy, transaction_request, daily_spent, current_time) -> {"decision": "ALLOWED"|"BLOCKED", "reason": str}
```
It relies on zero database I/O, network calls, or side effects, making it 100% testable, predictable, and verifiable via automated pytest suites.

### Principle 4: Instant Human Revocation (Kill Switch)
The Kill Switch alters policy state to `KILLED`. Because policy rules are loaded on every transaction evaluation, the very next request attempt by an agent is immediately blocked.

### Principle 5: Transparent Audit Trail
Every evaluation returns a structured human-readable explanation (e.g., *"amount exceeds per-transaction limit of ₹2,000"* or *"category 'gambling' is not permitted"*), and every rule change or kill switch activation is logged with exact actor provenance (`human` vs `system`).

---

## 3. Tech Stack & Infrastructure

| Component | Technology | Purpose |
|---|---|---|
| **Backend Framework** | FastAPI (Python 3.14) | High-performance asynchronous REST API & WebSockets |
| **Database** | SQLite + SQLAlchemy 2.0 ORM | Local relational storage & audit logging |
| **Payment Rail** | Razorpay Test Mode (`razorpay` SDK) | Production-grade test order creation |
| **Realtime Engine** | Native FastAPI WebSockets | Sub-millisecond event streaming to dashboard |
| **Agent Simulator** | Python CLI (`requests`) | Autonomous transaction generator supporting 4 scenarios |
| **Frontend Framework** | React 19 + Vite 8 + Tailwind CSS v3 | High-contrast Operator Dashboard UI |
| **Iconography & Styling** | Lucide React + Glassmorphism CSS | Cyberpunk dark mode aesthetic with live glowing indicators |
| **Test Framework** | Pytest 9.1 (`httpx`) | Unit testing for policy engine rules and API routes |

---

## 4. Database Schema & Data Models

The relational schema is defined in `backend/models.py` using SQLAlchemy ORM.

```
┌─────────────────┐       ┌─────────────────┐       ┌──────────────────────┐
│     agents      │1     1│    policies     │1     *│    policy_history    │
├─────────────────┤───────├─────────────────┤───────├──────────────────────┤
│ id (PK)         │       │ id (PK)         │       │ id (PK)              │
│ name            │       │ agent_id (FK)   │       │ agent_id (FK)        │
│ api_key         │       │ limit (paise)   │       │ version              │
│ created_at      │       │ budget (paise)  │       │ limit, budget, etc.  │
└────────┬────────┘       │ allowed_cats    │       └──────────────────────┘
         │                │ blocked_cats    │
         │                │ window_start/end│
         │                │ status          │
         │                └─────────────────┘
         │
         ├──────────────────────────────────┐
        1│*                                1│*
┌────────┴────────┐                ┌────────┴────────┐
│  transactions   │                │  audit_events   │
├─────────────────┤                ├─────────────────┤
│ id (PK)         │                │ id (PK)         │
│ agent_id (FK)   │                │ agent_id (FK)   │
│ amount (paise)  │                │ event_type      │
│ category        │                │ actor           │
│ merchant        │                │ timestamp       │
│ decision        │                │ detail          │
│ reason          │                └─────────────────┘
│ razorpay_order  │
└─────────────────┘
```

### 4.1 Amounts Stored in Paise
All financial amounts (`per_transaction_limit`, `daily_budget`, `amount`, `daily_spent`) are stored as **integers representing paise** (1 INR = 100 Paise).
* ₹800 = `80000` paise
* ₹2,000 = `200000` paise
* ₹10,000 = `1000000` paise

*Rationale*: Storing money as integers completely eliminates floating-point rounding errors and matches Razorpay API specifications.

### 4.2 Data Tables Detail

#### `agents` Table
* `id` (INTEGER, Primary Key): Unique agent ID.
* `name` (VARCHAR): Human-readable agent moniker (e.g., "ShoppingBot").
* `api_key` (VARCHAR, Unique): API authentication key.
* `created_at` (DATETIME): Timestamp of creation.

#### `policies` Table
* `id` (INTEGER, Primary Key)
* `agent_id` (INTEGER, Foreign Key -> `agents.id`, Unique)
* `per_transaction_limit` (INTEGER): Maximum single transaction amount allowed in paise.
* `daily_budget` (INTEGER): Total cumulative daily spend ceiling in paise.
* `allowed_categories` (TEXT, JSON Array): Whitelisted categories (e.g. `["groceries", "subscriptions"]`). If non-empty, any unlisted category is blocked.
* `blocked_categories` (TEXT, JSON Array): Blacklisted categories (e.g. `["gambling", "crypto"]`). Always blocked.
* `active_window_start` (VARCHAR): Start time in `HH:MM` format (e.g. "09:00").
* `active_window_end` (VARCHAR): End time in `HH:MM` format (e.g. "21:00").
* `status` (VARCHAR): Current agent state: `ACTIVE`, `KILLED`, or `PAUSED`.

#### `policy_history` Table
Immutable snapshot table. Every time an operator updates a policy, a new version snapshot is recorded so historical audit logs can accurately reflect the governing policy version at the exact time of any past decision.

#### `transactions` Table
* `id` (INTEGER, Primary Key)
* `agent_id` (INTEGER, Foreign Key)
* `amount` (INTEGER): Transaction request amount in paise.
* `category` (VARCHAR): Spend category (e.g., "groceries").
* `merchant` (VARCHAR): Merchant name (e.g., "FreshMart").
* `timestamp` (DATETIME): UTC timestamp of transaction attempt.
* `decision` (VARCHAR): `ALLOWED` or `BLOCKED`.
* `reason` (TEXT): Exact human-readable explanation.
* `razorpay_order_id` (VARCHAR, Nullable): Razorpay test order ID (`order_...`), present only if `decision == "ALLOWED"`.

#### `audit_events` Table
* `id` (INTEGER, Primary Key)
* `agent_id` (INTEGER, Foreign Key)
* `event_type` (VARCHAR): `POLICY_CHANGED`, `KILL_SWITCH_TOGGLED`, `TX_EVALUATED`.
* `actor` (VARCHAR): `human` (operator) or `system` (automated engine).
* `timestamp` (DATETIME)
* `detail` (TEXT): Comprehensive event narrative.

---

## 5. Policy Engine Logic & Evaluation Rules

The policy engine (`backend/policy_engine.py`) executes rules sequentially in strict priority order. If any rule fails, evaluation immediately short-circuits and returns a `BLOCKED` result with a descriptive reason.

```
                           Incoming Transaction Request
                                        │
                                        ▼
                        ┌───────────────────────────────┐
                        │      Rule 1: Agent Status     │
                        │    (KILLED / PAUSED Check)    │
                        └───────────────┬───────────────┘
                                        │ Pass
                                        ▼
                        ┌───────────────────────────────┐
                        │    Rule 2: Blocked Category   │
                        │    (Blacklist Match Check)    │
                        └───────────────┬───────────────┘
                                        │ Pass
                                        ▼
                        ┌───────────────────────────────┐
                        │    Rule 3: Allowed Category   │
                        │    (Whitelist Match Check)    │
                        └───────────────┬───────────────┘
                                        │ Pass
                                        ▼
                        ┌───────────────────────────────┐
                        │    Rule 4: Tx Spend Limit     │
                        │    (amount > tx_limit)        │
                        └───────────────┬───────────────┘
                                        │ Pass
                                        ▼
                        ┌───────────────────────────────┐
                        │     Rule 5: Daily Budget      │
                        │ (spent_today + amount > budget│
                        └───────────────┬───────────────┘
                                        │ Pass
                                        ▼
                        ┌───────────────────────────────┐
                        │  Rule 6: Active Time Window   │
                        │ (Check HH:MM within window)   │
                        └───────────────┬───────────────┘
                                        │ Pass
                                        ▼
                                 🟢 ALLOWED
```

### Rule Execution Priority Detail

1. **Rule 1: Agent Status Check**
   * If `status == "KILLED"` $\rightarrow$ `BLOCKED("agent is KILLED")`
   * If `status == "PAUSED"` $\rightarrow$ `BLOCKED("agent is PAUSED")`
2. **Rule 2: Blocked Category Check**
   * If `category.lower() in blocked_categories` $\rightarrow$ `BLOCKED("category '{category}' is not permitted")`
3. **Rule 3: Allowed Category Check**
   * If `allowed_categories` is non-empty AND `category.lower() not in allowed_categories` $\rightarrow$ `BLOCKED("category '{category}' is not in allowed list")`
4. **Rule 4: Per-Transaction Limit Check**
   * If `amount > per_transaction_limit` $\rightarrow$ `BLOCKED("amount exceeds per-transaction limit of ₹X")`
5. **Rule 5: Daily Budget Check**
   * `today_spent` is calculated by summing `amount` for all `ALLOWED` transactions of this agent today (since 00:00 UTC).
   * If `today_spent + amount > daily_budget` $\rightarrow$ `BLOCKED("would exceed daily budget of ₹X (already spent ₹Y today)")`
6. **Rule 6: Active Time Window Check**
   * Checks current hour/minute (`HH:MM`) against `active_window_start` and `active_window_end`.
   * Handles both standard windows (e.g., `09:00` to `21:00`) and overnight windows (e.g., `22:00` to `06:00`).
   * If outside window $\rightarrow$ `BLOCKED("outside allowed active window (09:00–21:00)")`
7. **Rule 7: Final Approval**
   * If all rules pass $\rightarrow$ `ALLOWED("transaction permitted by policy")`

---

## 6. API Reference & WebSockets

### REST API Endpoints

| Method | Path | Description | Payload / Response |
|---|---|---|---|
| `GET` | `/health` | Server health check | `{"status": "online"}` |
| `GET` | `/agents` | List all registered agents & policies | List of Agent objects |
| `POST` | `/agents` | Register a new agent | `{"name": "ShoppingBot"}` |
| `GET` | `/agents/{id}` | Get agent policy & details | Agent detail object |
| `GET` | `/agents/{id}/policy` | Get current policy rules | Policy object |
| `PATCH` | `/agents/{id}/policy` | Update policy rules | `{"per_transaction_limit": 300000, ...}` |
| `POST` | `/agents/{id}/kill` | Activate Kill Switch | `{"status": "KILLED"}` |
| `POST` | `/agents/{id}/resume` | Deactivate Kill Switch | `{"status": "ACTIVE"}` |
| `POST` | `/agents/{id}/transact` | Submit transaction attempt | `{"amount": 80000, "category": "groceries", "merchant": "FreshMart"}` |
| `GET` | `/agents/{id}/transactions` | Fetch transaction evaluation history | Array of transaction evaluations |
| `GET` | `/agents/{id}/audit` | Fetch audit trail log | Array of audit events |

### WebSocket Endpoint & Event Schemas
* **URL**: `ws://127.0.0.1:8000/ws/agents/{agent_id}`
* **Purpose**: Pushes real-time evaluation decisions, kill switch toggles, and policy edits to connected Operator Dashboards without polling.

#### Transaction Event (`TRANSACTION`)
```json
{
  "type": "TRANSACTION",
  "transaction": {
    "id": 42,
    "agent_id": 1,
    "amount": 80000,
    "category": "groceries",
    "merchant": "FreshMart",
    "timestamp": "2026-09-03T13:30:00Z",
    "decision": "ALLOWED",
    "reason": "transaction permitted by policy",
    "razorpay_order_id": "order_TXURPxUpWNNMGo"
  }
}
```

#### Kill Switch Event (`KILL_SWITCH`)
```json
{
  "type": "KILL_SWITCH",
  "status": "KILLED",
  "timestamp": "2026-09-03T13:30:10Z"
}
```

---

## 7. AI Agent Simulator (`simulator/agent_sim.py`)

To demonstrate real-time authorization control during live presentations and testing, the CLI simulator generates automated transaction requests against the backend.

### Execution Modes

1. **Normal Scenario**:
   ```bash
   python simulator/agent_sim.py --agent-id 1 --scenario normal
   ```
   *Sends ₹800 Groceries at FreshMart (Expected: ALLOWED).*

2. **Over Limit Scenario**:
   ```bash
   python simulator/agent_sim.py --agent-id 1 --scenario over-limit
   ```
   *Sends ₹5,000 Groceries at Amazon (Expected: BLOCKED).*

3. **Blocked Category Scenario**:
   ```bash
   python simulator/agent_sim.py --agent-id 1 --scenario blocked-category
   ```
   *Sends ₹700 Gambling at Casino (Expected: BLOCKED).*

4. **Continuous Loop Scenario ("The Money Moment")**:
   ```bash
   python simulator/agent_sim.py --agent-id 1 --scenario loop --interval 3.0
   ```
   *Continuously sends transaction requests every 3 seconds. Allows an operator to toggle the Kill Switch on the dashboard and observe the simulator's next transaction get instantly blocked.*

---

## 8. Failure Handling & Resilience Strategy

### Case 1: Policy Blocks Transaction
* Policy engine returns `BLOCKED`.
* Razorpay API call is completely bypassed.
* Transaction and Audit records are saved to SQLite.
* Dashboard receives WebSocket update.
* Response returned to Agent in $<10\text{ms}$.

### Case 2: Razorpay API Connection Failure
* Policy engine returns `ALLOWED`.
* System attempts `create_razorpay_order()`.
* If network/credentials error occurs, exception is caught.
* Decision is overridden to `BLOCKED` with reason `Razorpay API Error: <details>`.
* Audit trail records system error. System never falsely claims a payment succeeded.

### Case 3: Kill Switch Toggled Mid-Execution
* Operator clicks `KILL SWITCH` on dashboard.
* Policy status is set to `KILLED` in database.
* WebSocket broadcasts `KILL_SWITCH` event.
* Any transaction attempt in-flight reads the latest `KILLED` status and is blocked instantly.

---

## 9. Production Architecture Blueprint

For production-grade enterprise deployment, CircuitBreaker scales as follows:

```
                      ┌─────────────────────────┐
                      │    AGENT FLEET / SDK    │
                      └────────────┬────────────┘
                                   │ HTTPS / gRPC (Signed Requests)
                                   ▼
                       ┌───────────────────────┐
                       │  API Gateway / WAF    │
                       └───────────┬───────────┘
                                   │
                                   ▼
                       ┌───────────────────────┐
                       │  CircuitBreaker Node  │ (Stateless horizontal scaling)
                       │  Policy Service       │
                       └─────┬───────────┬─────┘
                             │           │
           ┌─────────────────┘           └─────────────────┐
           ▼                                               ▼
┌─────────────────────┐                         ┌─────────────────────┐
│    PostgreSQL DB    │                         │  Redis Cluster      │
│  (Policies & Audit) │                         │  (Limits & Budget)  │
└─────────────────────┘                         └─────────────────────┘
           │                                               │
           ▼                                               ▼
┌─────────────────────┐                         ┌─────────────────────┐
│  Kafka Event Stream │                         │  Razorpay Production│
└─────────────────────┘                         └─────────────────────┘
```

1. **Storage**: Replace SQLite with PostgreSQL or CockroachDB for multi-region replication.
2. **Distributed Rate Limiting**: Use Redis cluster for atomic daily budget accumulator checks using Lua scripts to prevent race conditions during high concurrency.
3. **Agent Identity**: Implement mTLS / OAuth2 Bearer tokens and HMAC signature verification for every request (`X-Signature`).
4. **Idempotency**: Require `Idempotency-Key` headers on transaction requests to prevent duplicate payment processing.

---

## 10. QA & Architectural Interview Reference

### Q1: Why isn't the agent allowed to call Razorpay directly?
**Answer**: If an AI agent holds direct Razorpay API credentials, spending policy rules can be bypassed or ignored due to prompt injection, model halluciations, or code execution bugs. Placing CircuitBreaker as an obligatory gateway guarantees that policy evaluation occurs before payment authorization.

### Q2: Why is the policy engine isolated from FastAPI and SQL queries?
**Answer**: By building `policy_engine.py` as a pure function without I/O dependencies, business logic remains deterministic and testable. Each block rule can be unit-tested in isolation without mocking database connections or HTTP servers.

### Q3: How is the daily budget calculated?
**Answer**: Daily spend is computed by summing the `amount` (in paise) of all `ALLOWED` transactions for that specific agent starting from midnight UTC (`00:00:00`) of the current date. Failed or blocked transactions do not consume the budget.

### Q4: What happens if Razorpay fails after policy approval?
**Answer**: CircuitBreaker wraps external API calls in exception handlers. If Razorpay returns an error, the transaction decision is safely converted to `BLOCKED`, the failure reason is recorded in the audit trail, and no order ID is returned.

### Q5: How does the Kill Switch work in real time?
**Answer**: Clicking `KILL SWITCH` updates `policy.status = "KILLED"` in the database and broadcasts a WebSocket notification. Because CircuitBreaker loads current policy state on every `/transact` request, the very next transaction attempt fails Rule 1 (`agent is KILLED`).

### Q6: Why are amounts stored in paise instead of floating-point rupees?
**Answer**: Floating-point arithmetic (`0.1 + 0.2 = 0.30000000000000004`) causes rounding bugs in financial software. Storing money as an integer count of paise (e.g. `80000` for ₹800) guarantees exact calculations and complies with Razorpay API requirements.

### Q7: Why are policy edits saved to a `policy_history` table?
**Answer**: Overwriting policy records destroys historical context. By saving versioned snapshots (`v1`, `v2`, etc.) in `policy_history`, auditors can inspect exactly what policy rules were active when a specific transaction was evaluated weeks or months in the past.
