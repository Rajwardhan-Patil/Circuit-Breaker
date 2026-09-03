# CircuitBreaker
## Agent Authorization & Payment Policy Enforcement Layer

**Razorpay AI Buildathon 2026 · Open Track**

---

# 1. Executive Summary

## One-Line Pitch

> **CircuitBreaker is an authorization and policy enforcement layer for autonomous payment agents, sitting between an AI agent and Razorpay, allowing humans to control what an agent can spend, revoke its authority instantly, and understand every payment decision.**

AI agents are increasingly capable of acting on behalf of humans, including making purchasing decisions.

The problem is not simply whether an agent can make a payment.

The real problem is:

> **How does a human remain in control when an AI agent is authorized to spend money autonomously?**

CircuitBreaker solves this by placing a policy enforcement layer between the agent and the payment rail.

```text
AI Agent
    │
    │ Payment Request
    ▼
┌──────────────────────────────┐
│       CIRCUITBREAKER         │
│                              │
│  Agent Authorization         │
│  Policy Engine               │
│  Spend Controls              │
│  Kill Switch                 │
│  Audit Trail                 │
│  Real-Time Events            │
└──────────────┬───────────────┘
               │
        ┌──────┴──────┐
        │             │
     BLOCKED        ALLOWED
        │             │
        ▼             ▼
     Audit        Razorpay
      Log         Test API
                      │
                      ▼
                 Order Created
```

The supplied project plan defines CircuitBreaker as a policy and enforcement layer between an AI agent and Razorpay, with real-time human control through a dashboard.

---

# 2. The Problem

Traditional payment systems assume a human is actively making the decision.

An autonomous agent changes that model.

Instead of:

```text
Human
  ↓
Payment
```

we get:

```text
Human
  ↓
Authorizes Agent
  ↓
AI Agent
  ↓
Multiple Payment Decisions
```

The human may no longer see every individual payment before it happens.

That creates four major control problems:

### 2.1 What can the agent buy?

A human may want an agent to purchase groceries but not gambling, crypto, or other restricted categories.

### 2.2 How much can the agent spend?

The human may want:

```text
Maximum per transaction: ₹2,000
Daily budget: ₹10,000
```

### 2.3 What happens when the agent misbehaves?

The human needs an immediate way to revoke the agent's authorization.

### 2.4 Why was a transaction allowed or blocked?

A payment system needs an understandable decision trail.

The project specification identifies these same three central gaps: controlling category/amount/frequency, instantly revoking permission, and maintaining a human-readable audit trail.

---

# 3. Core Product Idea

CircuitBreaker treats every agent transaction as an **authorization decision**.

Instead of asking:

> "Can Razorpay process this payment?"

CircuitBreaker asks:

> **"Is this transaction authorized by the current policy of this specific agent?"**

The flow becomes:

```text
Transaction Request
        │
        ▼
Identify Agent
        │
        ▼
Load Current Policy
        │
        ▼
Evaluate Transaction
        │
        ├───────────────┐
        │               │
        ▼               ▼
     BLOCKED          ALLOWED
        │               │
        ▼               ▼
   Audit Event       Razorpay
   Transaction       Test Order
        │               │
        └───────┬───────┘
                ▼
        WebSocket Event
                │
                ▼
          Operator UI
```

---

# 4. Design Principles

## Principle 1: Every payment attempt passes through the policy engine

The agent should not directly access the Razorpay payment rail.

```text
Correct:

Agent
 ↓
CircuitBreaker
 ↓
Razorpay
```

Not:

```text
Agent ──────────────► Razorpay
  │
  └────► CircuitBreaker
```

The second architecture allows the agent to bypass the control layer.

---

## Principle 2: Policy is evaluated before payment

No Razorpay order should be created for a blocked transaction.

```text
BLOCKED
    ↓
Database
    ↓
Audit
```

Whereas:

```text
ALLOWED
    ↓
Razorpay
    ↓
Order ID
    ↓
Database
    ↓
Audit
```

The project specification explicitly requires Razorpay order creation only after a transaction passes policy evaluation.

---

## Principle 3: Kill switch affects the next transaction attempt

The guarantee is:

> Every new transaction evaluation reads the current policy state.

Therefore:

```text
Agent running
      ↓
Human presses KILL
      ↓
Policy status = KILLED
      ↓
Next transaction
      ↓
BLOCKED
```

The system does not claim to magically cancel a transaction that has already been submitted to Razorpay.

---

## Principle 4: Every decision is explainable

Never return only:

```text
BLOCKED
```

Return:

```text
BLOCKED

Rule:
Per-transaction limit

Requested:
₹5,000

Maximum:
₹2,000
```

The backend stores a human-readable reason for every decision.

---

## Principle 5: The policy engine is independent from FastAPI

The most important business logic should be a pure function.

```text
policy_engine.py
        │
        ▼
evaluate(policy, transaction, daily_spent)
        │
        ▼
Decision
```

This makes it:

- deterministic
- testable
- reusable
- easy to review
- independent from HTTP

---

# 5. System Architecture

```text
                              ┌──────────────────────┐
                              │      AI AGENT        │
                              │    (Simulator)       │
                              └──────────┬───────────┘
                                         │
                                         │ POST /transact
                                         ▼
                         ┌─────────────────────────────┐
                         │       CIRCUITBREAKER        │
                         │                             │
                         │       FastAPI API           │
                         │             │               │
                         │             ▼               │
                         │       Policy Engine         │
                         │             │               │
                         │      ┌──────┴──────┐        │
                         │      │             │        │
                         │   BLOCKED       ALLOWED     │
                         │      │             │        │
                         │      │             ▼        │
                         │      │        Razorpay      │
                         │      │         Test API     │
                         │      │             │        │
                         │      └──────┬──────┘        │
                         │             ▼               │
                         │       SQLite Database        │
                         │             │               │
                         │             ▼               │
                         │       Audit Events          │
                         │             │               │
                         │             ▼               │
                         │       WebSocket Manager     │
                         └─────────────┬───────────────┘
                                       │
                                       │ WebSocket
                                       ▼
                         ┌─────────────────────────────┐
                         │      OPERATOR DASHBOARD     │
                         │                             │
                         │  Agent Status               │
                         │  Policy Editor              │
                         │  Kill Switch                │
                         │  Live Transactions         │
                         │  Audit Log                  │
                         └─────────────────────────────┘
```

The source architecture similarly places the simulated AI agent, CircuitBreaker policy layer, Razorpay test mode, and React operator dashboard into this flow.

---

# 6. Technology Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI |
| Language | Python |
| Database | SQLite |
| ORM | SQLAlchemy |
| Realtime | FastAPI WebSockets |
| Frontend | React |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Payment Rail | Razorpay Test Mode |
| Razorpay SDK | Python `razorpay` |
| Agent | Python CLI |
| Testing | pytest |
| Configuration | `.env` |

The original project plan specifies FastAPI, SQLite, WebSockets, React/Vite/Tailwind, Razorpay Test Mode, and a Python simulator for a one-day build.

---

# 7. Data Model

## 7.1 Agent

```text
Agent
├── id
├── name
├── api_key
└── created_at
```

Example:

```json
{
  "id": 1,
  "name": "ShoppingBot"
}
```

---

# 8. Policy

A policy defines what an agent is authorized to do.

```text
Policy
├── id
├── agent_id
├── per_transaction_limit
├── daily_budget
├── allowed_categories
├── blocked_categories
├── active_window_start
├── active_window_end
├── status
└── updated_at
```

### Example

```json
{
  "per_transaction_limit": 200000,
  "daily_budget": 1000000,
  "allowed_categories": [
    "groceries",
    "subscriptions"
  ],
  "blocked_categories": [
    "gambling",
    "crypto"
  ],
  "active_window_start": "09:00",
  "active_window_end": "21:00",
  "status": "ACTIVE"
}
```

Amounts are stored in **paise**.

```text
₹800       = 80000
₹2,000     = 200000
₹10,000    = 1000000
```

This avoids floating-point money calculations.

---

# 9. Policy History

Do not overwrite historical policies.

Every update creates a new policy version.

```text
Policy v1
₹2,000 limit
     │
     ▼
Policy v2
₹3,000 limit
     │
     ▼
Policy v3
₹1,000 limit
```

This allows the audit trail to explain what policy was active when decisions occurred.

---

# 10. Transaction

```text
Transaction
├── id
├── agent_id
├── amount
├── category
├── merchant
├── timestamp
├── decision
├── reason
└── razorpay_order_id
```

Decision:

```text
ALLOWED
BLOCKED
```

Example:

```json
{
  "id": 17,
  "agent_id": 1,
  "amount": 80000,
  "category": "groceries",
  "merchant": "FreshMart",
  "decision": "ALLOWED",
  "reason": "transaction permitted by policy",
  "razorpay_order_id": "order_xxxxx"
}
```

---

# 11. AuditEvent

```text
AuditEvent
├── id
├── agent_id
├── event_type
├── actor
├── timestamp
└── detail
```

Event types:

```text
POLICY_CHANGED
KILL_SWITCH_TOGGLED
TX_EVALUATED
```

Actors:

```text
human
system
```

These structures follow the specified project data model.

---

# 12. Policy Engine

File:

```text
backend/policy_engine.py
```

Function:

```python
evaluate(policy, transaction, daily_spent)
```

Input:

```text
Policy
Transaction Request
Today's Allowed Spend
```

Output:

```text
Decision
Reason
```

Example:

```python
{
    "decision": "BLOCKED",
    "reason": "amount exceeds per-transaction limit of ₹2,000"
}
```

---

# 13. Evaluation Rules

Rules MUST execute in this order.

## Rule 1: Agent Status

```text
IF status == KILLED
    BLOCK

IF status == PAUSED
    BLOCK
```

Reason:

```text
agent is KILLED
```

or:

```text
agent is PAUSED
```

---

## Rule 2: Blocked Category

```text
IF category ∈ blocked_categories
    BLOCK
```

Example:

```text
Category = gambling

BLOCKED

category 'gambling' is not permitted
```

---

## Rule 3: Allowed Category

If the allowed list is non-empty:

```text
IF category NOT IN allowed_categories
    BLOCK
```

Example:

```text
Allowed:
groceries
subscriptions

Requested:
electronics

BLOCKED
```

Reason:

```text
category 'electronics' is not in allowed list
```

---

## Rule 4: Transaction Limit

```text
IF amount > per_transaction_limit
    BLOCK
```

Example:

```text
Limit: ₹2,000
Request: ₹5,000

BLOCKED
```

Reason:

```text
amount exceeds per-transaction limit of ₹2,000
```

---

## Rule 5: Daily Budget

Calculate:

```text
today_spent =
SUM(ALLOWED transactions today)
```

Then:

```text
today_spent + requested_amount > daily_budget
```

means:

```text
BLOCK
```

Example:

```text
Daily budget = ₹10,000

Already spent = ₹9,700

New request = ₹500

₹9,700 + ₹500 = ₹10,200

BLOCKED
```

Reason:

```text
would exceed daily budget of ₹10,000
(already spent ₹9,700 today)
```

---

## Rule 6: Active Time Window

If configured:

```text
09:00 → 21:00
```

and transaction occurs at:

```text
22:30
```

then:

```text
BLOCKED
```

Reason:

```text
outside allowed active window (09:00–21:00)
```

---

## Rule 7: Allow

If every rule passes:

```text
ALLOWED
```

Only then call Razorpay.

---

# 14. Policy Engine Pseudocode

```text
function evaluate(policy, transaction, daily_spent):

    if policy.status == KILLED:
        return BLOCKED("agent is KILLED")

    if policy.status == PAUSED:
        return BLOCKED("agent is PAUSED")

    if transaction.category in policy.blocked_categories:
        return BLOCKED(
            "category '{category}' is not permitted"
        )

    if allowed_categories is not empty:
        if transaction.category not in allowed_categories:
            return BLOCKED(
                "category '{category}' is not in allowed list"
            )

    if transaction.amount > policy.per_transaction_limit:
        return BLOCKED(
            "amount exceeds per-transaction limit..."
        )

    if daily_spent + transaction.amount > policy.daily_budget:
        return BLOCKED(
            "would exceed daily budget..."
        )

    if outside_active_window:
        return BLOCKED(
            "outside allowed active window..."
        )

    return ALLOWED
```

---

# 15. Unit Tests

File:

```text
backend/tests/test_policy_engine.py
```

Minimum tests:

```text
test_killed_agent
test_paused_agent
test_blocked_category
test_disallowed_category
test_transaction_limit
test_daily_budget
test_time_window
test_valid_transaction
```

Expected:

```text
8 passed
```

The project specification specifically calls for independent unit testing of each block reason.

---

# 16. API Design

## Agent APIs

```http
POST /agents
GET /agents
GET /agents/{id}/policy
PATCH /agents/{id}/policy
```

---

## Kill Switch

```http
POST /agents/{id}/kill
POST /agents/{id}/resume
```

---

## Transaction

```http
POST /agents/{id}/transact
```

---

## Audit

```http
GET /agents/{id}/audit
GET /agents/{id}/transactions
```

---

## WebSocket

```text
WS /ws/agents/{id}
```

These endpoints follow the project's specified API surface.

---

# 17. Transaction Lifecycle

```text
POST /transact
       │
       ▼
Authenticate / identify agent
       │
       ▼
Load current policy
       │
       ▼
Calculate today's spend
       │
       ▼
Policy Engine
       │
       ├───────────────┐
       │               │
       ▼               ▼
    BLOCKED          ALLOWED
       │               │
       ▼               ▼
Create Transaction  Create Transaction
       │               │
       ▼               ▼
Create Audit       Razorpay Order
       │               │
       │               ▼
       │          Store Order ID
       │               │
       └───────┬───────┘
               ▼
       Broadcast WebSocket
               │
               ▼
            Response
```

Every evaluation must create a Transaction and AuditEvent, whether allowed or blocked.

---

# 18. Razorpay Integration

File:

```text
backend/razorpay_client.py
```

Configuration:

```env
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

Never hardcode credentials.

Only allowed transactions reach:

```text
Razorpay Orders API
```

Example:

```text
₹800 groceries
      ↓
Policy Engine
      ↓
ALLOWED
      ↓
Razorpay Order
      ↓
order_xxxxx
```

Blocked:

```text
₹5,000 groceries
      ↓
Policy Engine
      ↓
BLOCKED
      ↓
NO Razorpay call
```

The project requires Razorpay Test Mode because a real sandbox order makes the prototype demonstrably more than a mocked payment UI.

---

# 19. Kill Switch Architecture

Normal state:

```text
status = ACTIVE
```

Human clicks KILL:

```text
Dashboard
    ↓
POST /kill
    ↓
Policy.status = KILLED
    ↓
AuditEvent
    ↓
WebSocket
    ↓
Dashboard immediately changes
```

Next transaction:

```text
Agent
  ↓
/transact
  ↓
Policy Engine
  ↓
status == KILLED
  ↓
BLOCKED
```

The important guarantee:

> **The next transaction attempt sees the revoked authorization.**

---

# 20. Resume

```http
POST /agents/{id}/resume
```

Changes:

```text
KILLED → ACTIVE
```

Logs:

```text
KILL_SWITCH_TOGGLED
actor = human
```

Then:

```text
₹500 groceries
     ↓
ALLOWED
     ↓
Razorpay
```

---

# 21. WebSocket

File:

```text
backend/ws_manager.py
```

Connection:

```text
Dashboard
    ↓
WS /ws/agents/1
```

Whenever something happens:

```text
Transaction
Audit Event
Policy Change
Kill Switch
```

the backend pushes an event.

No polling.

The original design explicitly uses native FastAPI WebSockets for the live dashboard feed.

---

# 22. WebSocket Event Example

```json
{
  "type": "TRANSACTION",
  "transaction": {
    "amount": 80000,
    "category": "groceries",
    "merchant": "FreshMart",
    "decision": "ALLOWED",
    "reason": "transaction permitted by policy",
    "razorpay_order_id": "order_xxxxx"
  }
}
```

Kill event:

```json
{
  "type": "KILL_SWITCH",
  "status": "KILLED"
}
```

---

# 23. Agent Simulator

File:

```text
simulator/agent_sim.py
```

Usage:

```bash
python simulator/agent_sim.py \
  --agent-id 1 \
  --scenario normal
```

Supported scenarios:

```text
normal
over-limit
blocked-category
loop
```

---

# 24. Simulator Scenarios

## Normal

```text
₹800
groceries
FreshMart
```

Expected:

```text
ALLOWED
```

---

## Over Limit

```text
₹5,000
groceries
Amazon
```

Expected:

```text
BLOCKED
```

---

## Blocked Category

```text
₹700
gambling
Casino
```

Expected:

```text
BLOCKED
```

---

## Loop

Every three seconds:

```text
₹800 groceries
₹5,000 groceries
₹700 gambling
₹500 groceries
...
```

This lets the operator activate the kill switch while the agent is actively running.

The supplied specification explicitly defines these simulator scenarios.

---

# 25. Frontend

Technology:

```text
React
Vite
Tailwind CSS
```

Main dashboard:

```text
┌──────────────────────────────────────────────────────┐
│ CIRCUITBREAKER                       ● SYSTEM ONLINE │
├──────────────────────┬───────────────────────────────┤
│ AGENT                │ AGENT AUTHORIZATION           │
│                      │                               │
│ ShoppingBot          │       🟢 ACTIVE              │
│                      │                               │
│ Policy               │       [ KILL SWITCH ]        │
│ ₹2,000 / transaction │                               │
│ ₹10,000 / day        │                               │
│                      ├───────────────────────────────┤
│ Allowed              │ LIVE TRANSACTION FEED         │
│ groceries             │                               │
│ subscriptions         │ 🟢 ₹800 groceries            │
│                      │ 🔴 ₹5,000 groceries           │
│ Blocked              │ 🔴 ₹700 gambling              │
│ gambling              │                               │
│ crypto                │                               │
├──────────────────────┴───────────────────────────────┤
│ AUDIT LOG                                             │
└──────────────────────────────────────────────────────┘
```

The dashboard should have high contrast and be readable on a projector.

---

# 26. Dashboard Components

```text
frontend/src/
├── App.jsx
├── components/
│   ├── AgentSelector.jsx
│   ├── PolicyEditor.jsx
│   ├── KillSwitch.jsx
│   ├── LiveFeed.jsx
│   └── AuditLog.jsx
```

If time becomes limited, merge these into `App.jsx`.

The functionality matters more than artificial component-count inflation.

---

# 27. Agent Selector

Display:

```text
AGENT

ShoppingBot
Agent #1
● ACTIVE
```

Future:

```text
ShoppingBot
TravelBot
FinanceBot
```

But multi-agent support is not part of the first MVP.

---

# 28. Policy Editor

```text
POLICY

Per Transaction
₹ [ 2000 ]

Daily Budget
₹ [ 10000 ]

Allowed Categories
[ groceries ]
[ subscriptions ]

Blocked Categories
[ gambling ]
[ crypto ]

Active Window
[ 09:00 ] → [ 21:00 ]

[ SAVE POLICY ]
```

Saving calls:

```http
PATCH /agents/{id}/policy
```

---

# 29. Kill Switch UI

Active:

```text
┌──────────────────────────┐
│     🟢 AGENT ACTIVE      │
│                          │
│     [ KILL AGENT ]       │
└──────────────────────────┘
```

Killed:

```text
╔══════════════════════════╗
║     🚨 AGENT KILLED      ║
║                          ║
║  ALL NEW TRANSACTIONS    ║
║       ARE BLOCKED        ║
║                          ║
║     [ RESUME AGENT ]     ║
╚══════════════════════════╝
```

The kill state must be visually impossible to misunderstand.

---

# 30. Live Transaction Feed

Allowed:

```text
┌──────────────────────────────────────┐
│ 🟢 ALLOWED                  20:15:03 │
│ ₹800 · groceries · FreshMart        │
│ Razorpay: order_xxxxx               │
└──────────────────────────────────────┘
```

Blocked:

```text
┌──────────────────────────────────────┐
│ 🔴 BLOCKED                  20:15:06 │
│ ₹5,000 · groceries · Amazon         │
│ amount exceeds ₹2,000 limit         │
└──────────────────────────────────────┘
```

Newest transaction appears first.

---

# 31. Audit Log

Example:

```text
20:15:03
SYSTEM
Transaction evaluated

₹800 groceries at FreshMart

ALLOWED
```

```text
20:15:06
SYSTEM
Transaction evaluated

₹5,000 groceries at Amazon

BLOCKED
Reason:
amount exceeds per-transaction limit
```

```text
20:15:10
HUMAN
Kill switch activated
```

```text
20:15:13
SYSTEM
Transaction evaluated

₹500 groceries

BLOCKED
Reason:
agent is KILLED
```

This demonstrates that the system isn't merely making decisions. It explains them.

---

# 32. Recommended Repository

```text
circuit-breaker/
│
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── policy_engine.py
│   ├── razorpay_client.py
│   ├── ws_manager.py
│   ├── requirements.txt
│   │
│   └── tests/
│       └── test_policy_engine.py
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       └── components/
│           ├── AgentSelector.jsx
│           ├── PolicyEditor.jsx
│           ├── KillSwitch.jsx
│           ├── LiveFeed.jsx
│           └── AuditLog.jsx
│
├── simulator/
│   └── agent_sim.py
│
├── docs/
│   └── pitch_notes.md
│
├── .env
├── .env.example
├── .gitignore
└── README.md
```

This preserves the structure specified in the original project plan.

---

# 33. Build Order

Do NOT start with the frontend.

## Phase 1: Database

```text
database.py
models.py
```

Verify:

```text
SQLite created
Tables created
```

---

## Phase 2: Policy Engine

```text
policy_engine.py
```

Implement all rules.

---

## Phase 3: Tests

```text
pytest
```

Expected:

```text
8+ tests passed
```

---

## Phase 4: Transaction API

```text
POST /agents/{id}/transact
```

Verify:

```text
Allowed
Blocked
Reasons
Database logging
```

---

## Phase 5: Razorpay

Connect:

```text
Allowed
 ↓
Razorpay Test Order
```

Verify order ID is returned.

---

## Phase 6: Kill Switch

Implement:

```text
/kill
/resume
```

Test:

```text
Kill
 ↓
Valid transaction
 ↓
BLOCKED
```

---

## Phase 7: Audit

Implement:

```text
/audit
/transactions
```

---

## Phase 8: WebSocket

Implement:

```text
/ws/agents/{id}
```

---

## Phase 9: Simulator

Implement:

```text
normal
over-limit
blocked-category
loop
```

---

## Phase 10: Dashboard

Only now build:

```text
Policy Editor
Kill Switch
Live Feed
Audit Log
```

---

## Phase 11: Polish

Improve:

```text
Typography
Spacing
Colors
Status indicators
Animations
Error handling
Projector readability
```

---

## Phase 12: Documentation + Pitch

Create:

```text
README.md
docs/pitch_notes.md
```

The original plan uses essentially this same backend-first build sequence.

---

# 34. One-Day Schedule

| Time | Work |
|---|---|
| 0–1h | Project + SQLite |
| 1–2.5h | Policy engine |
| 2.5–3.5h | Tests |
| 3.5–5h | Transaction API + Razorpay |
| 5–6h | Kill switch + audit |
| 6–7h | WebSocket |
| 7–8h | Simulator |
| 8–10h | Dashboard |
| 10–11h | UI polish |
| 11–12h | README + pitch + rehearsal |

The supplied build plan allocates approximately the same 12-hour sequence.

---

# 35. MVP Definition

The MVP is complete when all of these work:

```text
[✓] Create agent
[✓] Create policy
[✓] Evaluate transaction
[✓] Block over-limit transaction
[✓] Block restricted category
[✓] Enforce allowed categories
[✓] Enforce daily budget
[✓] Enforce time window
[✓] Kill agent
[✓] Block next transaction after kill
[✓] Resume agent
[✓] Create Razorpay test order for allowed transaction
[✓] Store transaction
[✓] Store audit event
[✓] WebSocket live update
[✓] Simulator
[✓] Dashboard
```

---

# 36. What NOT to Build Initially

Do not spend your one-day build on:

```text
❌ Login
❌ Complex authentication
❌ Mobile application
❌ Kubernetes
❌ Microservices
❌ PostgreSQL
❌ Huge analytics suite
❌ AI chatbot
❌ LLM-generated everything
❌ Multi-agent orchestration
❌ Fancy landing page
❌ Complex deployment
```

The supplied plan explicitly says authentication is unnecessary for the demo and recommends cutting multi-agent support and other extras if time runs short.

---

# 37. Production Architecture

For the hackathon:

```text
FastAPI
SQLite
WebSocket
Razorpay Test
React
```

For production:

```text
                    ┌──────────────────┐
                    │   AI AGENTS      │
                    └────────┬─────────┘
                             │
                             ▼
                     API Gateway
                             │
                             ▼
                ┌──────────────────────┐
                │ Authorization Layer  │
                │                      │
                │ Policy Engine        │
                │ Agent Identity       │
                │ Risk Engine          │
                └──────────┬───────────┘
                           │
                ┌──────────┴──────────┐
                ▼                     ▼
          Policy Store          Event Stream
         PostgreSQL/Redis       Kafka/etc.
                │
                ▼
           Razorpay APIs
```

The project's architecture notes already identify the policy engine as stateless and SQLite as something that can be replaced by centralized production storage such as Postgres.

---

# 38. Failure Handling

This is particularly important for the architecture review.

## Case 1: Policy blocks

```text
Policy
 ↓
BLOCK
 ↓
No Razorpay request
 ↓
Audit
```

---

## Case 2: Razorpay fails

```text
Policy
 ↓
ALLOW
 ↓
Razorpay
 ↓
ERROR
 ↓
Record failure
 ↓
Return failure
```

Never pretend the payment succeeded.

---

## Case 3: Server crashes

Every important decision should be persisted so there isn't a mysterious gap in the audit trail.

---

## Case 4: Kill happens during continuous agent activity

```text
Agent loop
    │
    ├── Transaction A → ALLOWED
    │
    ├── Transaction B → ALLOWED
    │
    ├── HUMAN → KILL
    │
    └── Transaction C → BLOCKED
```

This is the key real-time authorization demonstration.

---

# 39. Idempotency and Safety

For a production implementation, payment requests should have an idempotency key.

Example:

```text
agent_id + transaction_request_id
```

If the same request arrives twice:

```text
Request #ABC
Request #ABC
```

the system should not accidentally create two orders.

For the hackathon MVP, document this as a production-hardening requirement if you do not fully implement it.

The project architecture notes already identify idempotency/safety and crash auditing as architecture-review topics.

---

# 40. Security Model

For the MVP:

```text
Agent
 ↓
API Key
 ↓
CircuitBreaker
```

For production:

```text
Agent Identity
 ↓
Signed credentials / OAuth
 ↓
Agent-specific authorization
 ↓
Policy evaluation
 ↓
Payment
```

The dashboard should be considered a privileged human control surface.

Production would require:

```text
Authentication
Authorization
RBAC
Audit integrity
Secret management
Rate limiting
Request signing
```

These are intentionally outside the one-day MVP.

---

# 41. The Demo

## Starting State

```text
ShoppingBot

Per transaction:
₹2,000

Daily budget:
₹10,000

Allowed:
groceries
subscriptions

Blocked:
gambling
crypto

Status:
ACTIVE
```

---

## Demo 1: Valid Transaction

```text
Agent:

Buy ₹800 groceries
from FreshMart
```

Result:

```text
🟢 ALLOWED

Razorpay:
order_xxxxx
```

---

## Demo 2: Amount Violation

```text
Agent:

Buy ₹5,000 groceries
```

Result:

```text
🔴 BLOCKED

amount exceeds
per-transaction limit of ₹2,000
```

No Razorpay order.

---

## Demo 3: Category Violation

```text
Agent:

Buy ₹700 gambling
```

Result:

```text
🔴 BLOCKED

category 'gambling'
is not permitted
```

---

# 42. The Money Moment

Start:

```bash
python simulator/agent_sim.py \
  --agent-id 1 \
  --scenario loop
```

The agent continuously attempts transactions.

Then:

```text
HUMAN
  ↓
🔴 KILL SWITCH
```

Immediately:

```text
AGENT KILLED
```

The simulator attempts:

```text
₹500 groceries
```

Result:

```text
🔴 BLOCKED

agent is KILLED
```

Then:

```text
RESUME
```

The next valid request:

```text
₹500 groceries
```

becomes:

```text
🟢 ALLOWED
```

This is the strongest demonstration in the supplied pitch plan.

---

# 43. Five-Minute Pitch

## 0:00–0:30: Problem

> AI agents are moving from answering questions to taking actions. Once an agent can spend money autonomously, humans need a control layer between the agent and the payment system.

---

## 0:30–1:00: Solution

> CircuitBreaker is that control layer.

Show:

```text
Agent
 ↓
CircuitBreaker
 ↓
Policy
 ↓
Razorpay
```

---

## 1:00–3:00: Demo

Demonstrate:

```text
₹800 groceries
→ ALLOWED

₹5,000 groceries
→ BLOCKED

₹700 gambling
→ BLOCKED

KILL SWITCH
→ ₹500 groceries
→ BLOCKED

RESUME
→ ₹500 groceries
→ ALLOWED
```

---

## 3:00–4:00: Engineering

Explain:

```text
Pure policy engine
SQLite
FastAPI
WebSockets
Razorpay Test API
Audit trail
```

Mention that the policy engine is independently testable.

---

## 4:00–5:00: Production Vision

Explain:

```text
SQLite → PostgreSQL
API keys → strong agent identity
Rules → risk scoring
Single agent → agent fleet
Local events → distributed event system
```

Then finish with:

> **CircuitBreaker is the trust layer between autonomous intelligence and real-world financial action.**

---

# 44. Architecture Interview Questions

## Why isn't the agent allowed to call Razorpay directly?

Because then the policy layer can be bypassed.

---

## Why is the policy engine separate from FastAPI?

Because business rules should not depend on HTTP handlers.

It becomes:

```text
Pure logic
+
Unit tests
```

---

## Why SQLite?

Because this is a one-day prototype.

Production would use centralized persistent storage.

---

## Why WebSockets?

Because transaction decisions and kill-switch events should appear in the dashboard immediately without polling.

---

## What happens when the kill switch is pressed?

Current policy status becomes `KILLED`, an audit event is created, the dashboard receives a real-time event, and the next transaction evaluation is blocked.

---

## What if Razorpay fails?

The payment should be marked as failed and the event should remain auditable.

---

## What if the same transaction is submitted twice?

Production should use idempotency keys to prevent duplicate payment orders.

---

## How would this scale?

The policy engine can be stateless and horizontally scaled, while policy/audit/payment state moves into centralized infrastructure.

---

## How would you secure it?

Strong agent identity, signed requests, authentication, RBAC, rate limiting, secret management, and tamper-resistant audit storage.

---

# 45. Stretch Goals

Only after the MVP is stable.

## Risk Score

```text
Agent Risk Score: 72/100
```

Based on:

```text
Block rate
Transaction frequency
Category risk
Amount anomalies
Policy violations
```

---

## Multi-Agent Dashboard

```text
ShoppingBot
🟢 ACTIVE

TravelBot
🟢 ACTIVE

FinanceBot
🔴 KILLED
```

---

## Alerts

Kill switch:

```text
🚨 ShoppingBot killed by Rajwardhan
```

Could trigger Slack/webhook notifications.

---

## AI Explanation

Instead of static reasons:

```text
BLOCKED
```

provide a natural-language explanation:

> ShoppingBot attempted a ₹5,000 purchase, but its operator-authorized transaction limit is ₹2,000.

The supplied plan lists LLM-generated explanations, multi-agent views, alerts, and risk scoring as stretch goals.

---

# 46. GitHub README Structure

```text
# CircuitBreaker

## Problem

## Solution

## Demo

## Architecture

## How It Works

## Policy Engine

## API

## Razorpay Integration

## WebSocket Architecture

## Running Locally

## Running the Simulator

## Demo Scenario

## Tests

## Production Architecture

## Known Limitations

## Future Work
```

---

# 47. Known Limitations

Be honest.

```text
1. SQLite is used for the prototype.
2. Authentication is intentionally omitted.
3. Agent identity is simplified.
4. Razorpay integration uses test mode.
5. Single-process WebSocket management is used.
6. Idempotency requires production hardening.
7. No distributed locking.
8. No production-grade secrets manager.
9. No multi-agent management initially.
```

This is much better than pretending your 12-hour project is ready to process half the world's commerce.

---

# 48. What Makes This Strong for the Buildathon

The project demonstrates:

```text
Problem identification
        +
System design
        +
Payment integration
        +
Authorization
        +
Real-time systems
        +
Database design
        +
Testing
        +
Failure handling
        +
Human-in-the-loop controls
```

It is not merely an AI wrapper.

The important technical story is:

> **Autonomous systems need authorization boundaries before they interact with irreversible real-world systems.**

Payments are an excellent demonstration because the consequence of a bad agent decision is immediate and measurable.

---

# 49. Final Product Definition

## CircuitBreaker

### Input

```text
Agent
Transaction
Current Policy
Current Time
Today's Spend
```

### Processing

```text
Authorization
     ↓
Policy Evaluation
     ↓
Decision
```

### Output

```text
ALLOWED
   ↓
Razorpay Order

OR

BLOCKED
   ↓
Reason
```

### Always

```text
Transaction logged
Audit event created
WebSocket event broadcast
```

### Human Control

```text
Edit Policy
     ↓
Immediate policy update

KILL
     ↓
Immediate authorization revocation

RESUME
     ↓
Authorization restored
```

---

# 50. Final Positioning

### Product

**CircuitBreaker**

### Category

**Agent Authorization Infrastructure**

### Problem

**Autonomous agents can make financial decisions without sufficient human control.**

### Solution

**A policy enforcement layer between AI agents and payment infrastructure.**

### Killer Feature

**Instant human revocation of agent payment authority.**

### Proof

**Real Razorpay test-mode orders for allowed transactions.**

### Trust Layer

**Human-readable audit trail for every decision.**

### Technical Differentiator

**Pure, deterministic policy engine + real-time enforcement + payment-rail integration.**

### Demo

```text
AI Agent
   ↓
₹800 groceries
   ↓
🟢 ALLOWED
   ↓
Razorpay

AI Agent
   ↓
₹5,000 groceries
   ↓
🔴 BLOCKED

Human
   ↓
🔴 KILL SWITCH

AI Agent
   ↓
₹500 groceries
   ↓
🔴 BLOCKED

Human
   ↓
RESUME

AI Agent
   ↓
₹500 groceries
   ↓
🟢 ALLOWED
   ↓
Razorpay
```

## The core sentence to build around

> **"CircuitBreaker gives humans a real-time authorization boundary between autonomous AI decisions and real-world payments."**

That is the complete product direction. The existing source plan supplies the implementation backbone, while this version tightens the positioning around **agent authorization, enforcement, failure handling, and architecture quality**, which is the part that matters when the project is also functioning as a hiring signal. The original project already identifies the same central trust-layer thesis and demo sequence.