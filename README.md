# CircuitBreaker

**Agent Authorization & Payment Policy Enforcement Layer**  
*Razorpay AI Buildathon 2026*

CircuitBreaker is a policy enforcement and authorization layer that sits between autonomous AI Agents and Razorpay. It evaluates transaction requests in real-time against configurable spend limits, category whitelists/blacklists, and time windows before creating Razorpay payment orders.

---

## Virtual Environment Activation Commands

Before running python commands, activate the virtual environment in your terminal:

### PowerShell:
```powershell
.\venv\Scripts\Activate.ps1
```
*(If PowerShell restricts scripts, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process` first).*

### Command Prompt (CMD):
```cmd
venv\Scripts\activate.bat
```

### Git Bash / Bash:
```bash
source venv/Scripts/activate
```

---

## Quick Start Guide


### Step 1: Run the Backend API Server

From the project root directory:

```bash
# Option A: After activating venv
python -m uvicorn backend.main:app --reload --port 8000

# Option B: Direct execution
.\venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```
- API Base URL: `http://127.0.0.1:8000`
- Interactive OpenAPI Docs: `http://127.0.0.1:8000/docs`
- WebSocket Endpoint: `ws://127.0.0.1:8000/ws/agents/1`

---

### Step 2: Run the Frontend Operator Dashboard

In a second terminal window:

```bash
cd frontend
npm run dev
```
- Open your browser at `http://localhost:5173` (or the URL printed by Vite).

---

### Step 3: Run the AI Agent Simulator (CLI)

In a third terminal window (activate `venv` first):

#### Scenario A: Normal Transaction (₹800 Groceries -> ALLOWED)
```bash
python simulator/agent_sim.py --scenario normal
```

#### Scenario B: Over-Limit Transaction (₹5,000 Groceries -> BLOCKED)
```bash
python simulator/agent_sim.py --scenario over-limit
```

#### Scenario C: Blocked Category Transaction (₹700 Gambling -> BLOCKED)
```bash
python simulator/agent_sim.py --scenario blocked-category
```

#### Scenario D: Continuous Loop Demo ("The Money Moment")
```bash
python simulator/agent_sim.py --scenario loop --interval 3.0
```

#### Additional CLI Actions
```bash
# Check agent status & active policy
python simulator/agent_sim.py --action status

# Activate Kill Switch (revoke spending authority)
python simulator/agent_sim.py --action kill

# Deactivate Kill Switch (restore authority)
python simulator/agent_sim.py --action resume

# Reset policy to initial default rules
python simulator/agent_sim.py --action reset-policy
```


---

### Step 4: Run Automated Pytest Suite

To verify all policy engine and API tests:

```bash
python -m pytest backend/tests
```

---

## Architecture Summary


```
   [ AI Agent (Simulator CLI) ]
                 │
                 │ POST /agents/{id}/transact
                 ▼
     [ CircuitBreaker API ] ──(BLOCKED)──► [ Audit Log & DB ]
                 │
             (ALLOWED)
                 │
                 ▼
     [ Razorpay Order Created ]
                 │
                 ▼
     [ Live WebSocket Broadcast ] ──► [ Operator Dashboard UI ]
```

- **Backend**: FastAPI + SQLite + SQLAlchemy 2.0 + Razorpay SDK
- **Frontend**: React 19 + Vite 8 + Tailwind CSS
- **Policy Engine**: Pure functional evaluation (`backend/policy_engine.py`)
