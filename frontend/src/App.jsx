import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Power,
  Zap,
  CreditCard,
  Activity,
  Sliders,
  FileText,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Lock,
  Copy,
  Check,
  Plus,
  Search,
  HelpCircle,
  Clock,
  Wallet,
  RotateCcw,
  Sparkles,
  Send,
  Bot,
  AlertTriangle
} from 'lucide-react';

const API_BASE = "http://127.0.0.1:8000";
const WS_BASE = "ws://127.0.0.1:8000";

function formatRupees(paise) {
  if (paise == null) return "₹0.00";
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseUtcTimestamp(ts) {
  if (!ts) return new Date();
  if (typeof ts === 'string') {
    const clean = ts.trim();
    if (!clean.endsWith('Z') && !clean.includes('+') && !clean.includes('-')) {
      return new Date(clean + 'Z');
    }
  }
  return new Date(ts);
}

function formatTimeString(ts) {
  const date = parseUtcTimestamp(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDateTimeString(ts) {
  const date = parseUtcTimestamp(ts);
  return date.toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' });
}

function App() {
  const [agentId, setAgentId] = useState(1);
  const [agent, setAgent] = useState(null);
  const [policy, setPolicy] = useState({
    per_transaction_limit: 200000,
    daily_budget: 1000000,
    allowed_categories: ["groceries", "subscriptions"],
    blocked_categories: ["gambling", "crypto"],
    active_window_start: "09:00",
    active_window_end: "21:00",
    status: "ACTIVE"
  });

  const [transactions, setTransactions] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [wsStatus, setWsStatus] = useState("CONNECTING");
  const [loading, setLoading] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [toast, setToast] = useState(null);
  const [copiedOrderId, setCopiedOrderId] = useState(null);
  const [auditSearch, setAuditSearch] = useState("");

  // Tab State: "copilot" | "rules" | "transactions" | "audit"
  const [activeTab, setActiveTab] = useState("copilot");

  // Policy Form State
  const [formLimit, setFormLimit] = useState(2000);
  const [formBudget, setFormBudget] = useState(10000);
  const [formAllowed, setFormAllowed] = useState("groceries, subscriptions");
  const [formBlocked, setFormBlocked] = useState("gambling, crypto");
  const [formStart, setFormStart] = useState("09:00");
  const [formEnd, setFormEnd] = useState("21:00");

  // Audit filter state
  const [auditFilter, setAuditFilter] = useState("ALL");

  // Real-time Clock State
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // AI Intent Console State
  const [intentInput, setIntentInput] = useState("Buy groceries for ₹800");
  const [intentLoading, setIntentLoading] = useState(false);
  const [intentResult, setIntentResult] = useState(null);

  const wsRef = useRef(null);

  const handleSendIntent = async (textToSubmit) => {
    const queryText = textToSubmit || intentInput;
    if (!queryText || !queryText.trim()) return;

    setIntentLoading(true);
    setIntentResult(null);

    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: queryText })
      });

      const data = await res.json();
      if (res.ok) {
        setIntentResult(data);
        showToast(
          `AI Intent: ${data.decision.status} - ${data.decision.reason}`,
          data.decision.status === "ALLOWED" ? "success" : "error"
        );
      } else {
        setIntentResult({
          intent: null,
          decision: null,
          error: data.detail || "Unable to process transaction intent"
        });
        showToast(data.detail || "Unable to parse AI intent", "error");
      }
    } catch (err) {
      setIntentResult({
        intent: null,
        decision: null,
        error: "Network error processing AI intent request"
      });
      showToast("Network error connecting to AI Intent endpoint", "error");
    } finally {
      setIntentLoading(false);
    }
  };

  const handlePresetIntent = (text) => {
    setIntentInput(text);
    handleSendIntent(text);
  };

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Fetch initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [agentRes, txRes, auditRes] = await Promise.all([
        fetch(`${API_BASE}/agents/${agentId}`),
        fetch(`${API_BASE}/agents/${agentId}/transactions`),
        fetch(`${API_BASE}/agents/${agentId}/audit`)
      ]);

      if (agentRes.ok) {
        const agentData = await agentRes.json();
        setAgent(agentData);
        if (agentData.policy) {
          setPolicy(agentData.policy);
          setFormLimit(agentData.policy.per_transaction_limit / 100);
          setFormBudget(agentData.policy.daily_budget / 100);
          setFormAllowed(agentData.policy.allowed_categories.join(", "));
          setFormBlocked(agentData.policy.blocked_categories.join(", "));
          setFormStart(agentData.policy.active_window_start || "09:00");
          setFormEnd(agentData.policy.active_window_end || "21:00");
        }
      }

      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData);
      }

      if (auditRes.ok) {
        const auditData = await auditRes.json();
        setAuditEvents(auditData);
      }
    } catch (err) {
      console.error("Failed to fetch initial data:", err);
      showToast("Unable to connect to CircuitBreaker backend", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [agentId]);

  // Setup WebSocket connection
  useEffect(() => {
    let socket;
    let reconnectTimer;

    const connectWs = () => {
      setWsStatus("CONNECTING");
      socket = new WebSocket(`${WS_BASE}/ws/agents/${agentId}`);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsStatus("CONNECTED");
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "TRANSACTION") {
            setTransactions((prev) => [data.transaction, ...prev]);
            fetch(`${API_BASE}/agents/${agentId}/audit`)
              .then((r) => r.json())
              .then((aData) => setAuditEvents(aData))
              .catch(() => {});
          } else if (data.type === "KILL_SWITCH") {
            setPolicy((prev) => ({ ...prev, status: data.status }));
            fetch(`${API_BASE}/agents/${agentId}/audit`)
              .then((r) => r.json())
              .then((aData) => setAuditEvents(aData))
              .catch(() => {});
          } else if (data.type === "POLICY_UPDATE") {
            setPolicy(data.policy);
            setFormLimit(data.policy.per_transaction_limit / 100);
            setFormBudget(data.policy.daily_budget / 100);
            setFormAllowed(data.policy.allowed_categories.join(", "));
            setFormBlocked(data.policy.blocked_categories.join(", "));
            fetch(`${API_BASE}/agents/${agentId}/audit`)
              .then((r) => r.json())
              .then((aData) => setAuditEvents(aData))
              .catch(() => {});
          }
        } catch (err) {
          console.error("Error processing WS message:", err);
        }
      };

      socket.onclose = () => {
        setWsStatus("DISCONNECTED");
        reconnectTimer = setTimeout(connectWs, 3000);
      };

      socket.onerror = (err) => {
        console.error("WS error:", err);
        socket.close();
      };
    };

    connectWs();

    return () => {
      if (socket) socket.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [agentId]);

  // Kill switch toggle handler
  const handleKillToggle = async () => {
    const isKilled = policy.status === "KILLED";
    const endpoint = isKilled ? `${API_BASE}/agents/${agentId}/resume` : `${API_BASE}/agents/${agentId}/kill`;

    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPolicy((prev) => ({ ...prev, status: data.status }));
        showToast(
          isKilled ? "Agent payment authority restored" : "Emergency Kill Switch Activated! Agent spending revoked.",
          isKilled ? "success" : "error"
        );
        fetch(`${API_BASE}/agents/${agentId}/policy`)
          .then((r) => r.json())
          .then((pData) => setPolicy(pData))
          .catch(() => {});
      } else {
        showToast("Failed to toggle kill switch", "error");
      }
    } catch (err) {
      showToast("Network error toggling kill switch", "error");
    }
  };

  // Reset Policy handler
  const handleResetPolicy = async () => {
    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/reset-policy`, { method: "POST" });
      if (res.ok) {
        const updatedPol = await res.json();
        setPolicy(updatedPol);
        setFormLimit(updatedPol.per_transaction_limit / 100);
        setFormBudget(updatedPol.daily_budget / 100);
        setFormAllowed(updatedPol.allowed_categories.join(", "));
        setFormBlocked(updatedPol.blocked_categories.join(", "));
        setFormStart(updatedPol.active_window_start || "09:00");
        setFormEnd(updatedPol.active_window_end || "21:00");
        showToast("Policy reset to default rules!");
      } else {
        showToast("Failed to reset policy", "error");
      }
    } catch (err) {
      showToast("Network error resetting policy", "error");
    }
  };

  // Save Policy handler
  const handleSavePolicy = async (e) => {
    e.preventDefault();
    setSavingPolicy(true);

    const allowedArr = formAllowed.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const blockedArr = formBlocked.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

    const payload = {
      per_transaction_limit: Math.round(parseFloat(formLimit) * 100),
      daily_budget: Math.round(parseFloat(formBudget) * 100),
      allowed_categories: allowedArr,
      blocked_categories: blockedArr,
      active_window_start: formStart,
      active_window_end: formEnd
    };

    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/policy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const updatedPol = await res.json();
        setPolicy(updatedPol);
        showToast("Policy rules updated & enforced live!");
      } else {
        showToast("Failed to update policy rules", "error");
      }
    } catch (err) {
      showToast("Network error saving policy", "error");
    } finally {
      setSavingPolicy(false);
    }
  };

  // Helper to add category to string input
  const addCategoryPreset = (target, category) => {
    if (target === "allowed") {
      const current = formAllowed.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (!current.includes(category.toLowerCase())) {
        const next = [...current, category.toLowerCase()].join(", ");
        setFormAllowed(next);
      }
    } else {
      const current = formBlocked.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (!current.includes(category.toLowerCase())) {
        const next = [...current, category.toLowerCase()].join(", ");
        setFormBlocked(next);
      }
    }
  };

  // Copy Order ID to clipboard
  const copyToClipboard = (orderId) => {
    navigator.clipboard.writeText(orderId);
    setCopiedOrderId(orderId);
    showToast(`Copied Order ID: ${orderId}`);
    setTimeout(() => setCopiedOrderId(null), 2000);
  };

  // Trigger test transaction directly from UI
  const handleTestTx = async (amountPaise, category, merchant) => {
    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/transact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountPaise, category, merchant })
      });
      if (res.ok) {
        const data = await res.json();
        showToast(
          `Tx (${formatRupees(amountPaise)}): ${data.decision} - ${data.reason}`,
          data.decision === "ALLOWED" ? "success" : "error"
        );
      }
    } catch (err) {
      showToast("Error triggering test transaction", "error");
    }
  };

  // Calculate daily spent total from allowed transactions today
  const todayIsoDate = new Date().toISOString().split('T')[0];
  const todaySpentPaise = transactions
    .filter((t) => t.decision === "ALLOWED" && t.timestamp && t.timestamp.startsWith(todayIsoDate))
    .reduce((sum, t) => sum + t.amount, 0);

  const isKilled = policy.status === "KILLED";
  const budgetProgressPercent = Math.min(100, (todaySpentPaise / (policy.daily_budget || 1)) * 100);

  // Filter audit events
  const filteredAuditEvents = auditEvents
    .filter((ev) => {
      if (auditFilter === "ALL") return true;
      if (auditFilter === "KILL_SWITCH") return ev.event_type === "KILL_SWITCH_TOGGLED";
      if (auditFilter === "POLICY") return ev.event_type === "POLICY_CHANGED";
      if (auditFilter === "EVALUATION") return ev.event_type === "TX_EVALUATED";
      return true;
    })
    .filter((ev) => {
      if (!auditSearch.trim()) return true;
      const q = auditSearch.toLowerCase();
      return (
        ev.detail.toLowerCase().includes(q) ||
        ev.event_type.toLowerCase().includes(q) ||
        ev.actor.toLowerCase().includes(q)
      );
    });

  return (
    <div className="min-h-screen bg-[#090d16] text-[#e6edf3] font-sans antialiased flex flex-col selection:bg-[#2f81f7]/30 selection:text-white">
      {/* Toast Notification Banner */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-bounce">
          <div
            className={`px-4 py-3 rounded-xl shadow-2xl border text-xs font-medium font-mono flex items-center gap-2 backdrop-blur-md ${
              toast.type === "error"
                ? "bg-[#3c1e21]/90 text-[#f85149] border-[#f85149]/50"
                : "bg-[#1b382b]/90 text-[#3fb950] border-[#2ea043]/50"
            }`}
          >
            {toast.type === "error" ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Navbar Header */}
      <header className="border-b border-[#1f2638] bg-[#0d121f]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            {/* Restored Original SVG Logo */}
            <img src="/logo.svg" alt="CircuitBreaker Logo" className="w-10 h-10 rounded-lg shadow-sm" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white font-mono bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
                  circuit breaker
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#161f33] text-[#38bdf8] border border-[#2f81f7]/30 font-semibold tracking-wide">
                  Razorpay Gate
                </span>
              </div>
              <p className="text-[11px] text-[#8b949e] hidden sm:block">
                AI Agent Payment Governance & Spend Control Center
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Realtime Live Clock */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#131927] border border-[#232d42] text-xs font-mono">
              <Clock className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span className="text-white font-bold tracking-wider">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            {/* Realtime WebSocket Status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#131927] border border-[#232d42] text-xs font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  wsStatus === "CONNECTED"
                    ? "bg-[#3fb950] shadow-[0_0_8px_#3fb950]"
                    : wsStatus === "CONNECTING"
                    ? "bg-[#d29922] animate-pulse"
                    : "bg-[#f85149]"
                }`}
              />
              <span className="text-[#8b949e] text-[11px] font-semibold">
                {wsStatus === "CONNECTED" ? "LIVE SYNC ACTIVE" : wsStatus}
              </span>
            </div>

            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 rounded-xl bg-[#161f33] hover:bg-[#202c48] text-[#e6edf3] transition-all border border-[#232d42] text-xs font-medium flex items-center gap-1.5 cursor-pointer hover:border-[#38bdf8]/50"
              title="Sync latest data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#38bdf8]" : ""}`} />
              <span className="hidden md:inline font-mono text-xs">Sync</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* HERO EXECUTIVE SUMMARY CARD */}
        <div
          className={`rounded-2xl p-5 sm:p-6 space-y-5 border shadow-xl transition-all ${
            isKilled
              ? "bg-gradient-to-b from-[#3c1e21] to-[#1e0f11] border-[#f85149]/60 shadow-rose-950/30"
              : "bg-gradient-to-b from-[#131927] to-[#0d121f] border-[#1f2638] shadow-slate-950/40"
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#232d42] pb-5">
            
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Shield className="w-5 h-5 text-[#38bdf8]" />
                <span className="text-base font-bold text-white font-mono tracking-wide">
                  Agent #{agentId}: {agent?.name || "ShoppingBot"}
                </span>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-md bg-[#090d16] text-[#8b949e] border border-[#232d42]">
                  Key: {agent?.api_key || "sb_key_..."}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {isKilled ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold font-mono bg-rose-500/10 text-[#f85149] border border-[#f85149]/40">
                    <ShieldAlert className="w-4 h-4" /> KILLED — ALL AGENT PAYMENTS BLOCKED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold font-mono bg-emerald-500/10 text-[#3fb950] border border-[#2ea043]/40">
                    <ShieldCheck className="w-4 h-4" /> AUTHORIZED — GOVERNANCE ACTIVE & PROTECTED
                  </span>
                )}
              </div>
            </div>

            {/* Prominent Emergency Kill Switch Toggle */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleKillToggle}
                className={`w-full md:w-auto px-6 py-3 rounded-xl text-xs font-bold uppercase font-mono tracking-wider flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-lg active:scale-95 ${
                  isKilled
                    ? "bg-gradient-to-r from-[#2ea043] to-[#3fb950] hover:from-[#3fb950] hover:to-[#2ea043] text-white border border-[#3fb950] shadow-emerald-950/50"
                    : "bg-gradient-to-r from-[#da3633] to-[#f85149] hover:from-[#f85149] hover:to-[#da3633] text-white border border-[#f85149] shadow-rose-950/50"
                }`}
              >
                <Power className="w-4 h-4 stroke-[2.5]" />
                <span>{isKilled ? "Restore Payment Authority" : "Revoke Payment Authority (Kill Switch)"}</span>
              </button>
            </div>

          </div>

          {/* 4 Stat Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Daily Spend Tracker */}
            <div className="p-4 rounded-xl bg-[#090d16]/70 border border-[#232d42] space-y-2 hover:border-[#2f81f7]/40 transition-colors">
              <div className="flex items-center justify-between text-xs text-[#8b949e] font-medium">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-[#38bdf8]" />
                  <span className="font-semibold text-slate-300">Daily Spend Tracker</span>
                </div>
                <span className="font-mono text-xs text-[#38bdf8] font-bold">{budgetProgressPercent.toFixed(0)}%</span>
              </div>
              <div className="text-xl font-bold font-mono text-white">
                {formatRupees(todaySpentPaise)} <span className="text-xs text-[#8b949e] font-sans font-normal">/ {formatRupees(policy.daily_budget)}</span>
              </div>
              <div className="w-full bg-[#182030] h-2 rounded-full overflow-hidden border border-[#232d42]">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    budgetProgressPercent >= 90
                      ? "bg-[#f85149]"
                      : budgetProgressPercent >= 70
                      ? "bg-[#d29922]"
                      : "bg-[#2f81f7]"
                  }`}
                  style={{ width: `${budgetProgressPercent}%` }}
                />
              </div>
            </div>

            {/* Per-Transaction Cap */}
            <div className="p-4 rounded-xl bg-[#090d16]/70 border border-[#232d42] space-y-2 hover:border-[#2f81f7]/40 transition-colors">
              <div className="flex items-center gap-2 text-xs text-[#8b949e] font-medium">
                <CreditCard className="w-4 h-4 text-[#2f81f7]" />
                <span className="font-semibold text-slate-300">Single Purchase Cap</span>
              </div>
              <div className="text-xl font-bold font-mono text-white">
                {formatRupees(policy.per_transaction_limit)}
              </div>
              <span className="text-[11px] text-[#8b949e] block">Maximum limit per single order</span>
            </div>

            {/* Active Time Window */}
            <div className="p-4 rounded-xl bg-[#090d16]/70 border border-[#232d42] space-y-2 hover:border-[#3fb950]/40 transition-colors">
              <div className="flex items-center justify-between text-xs text-[#8b949e] font-medium">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#3fb950]" />
                  <span className="font-semibold text-slate-300">Active Window</span>
                </div>
                <span className="font-mono text-[10px] text-[#38bdf8] font-bold">
                  NOW {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="text-xl font-bold font-mono text-[#3fb950]">
                {policy.active_window_start || "00:00"} – {policy.active_window_end || "23:59"}
              </div>
              <span className="text-[11px] text-[#8b949e] block">Real-time allowed payment hours</span>
            </div>

            {/* Total Evaluated Attempts */}
            <div className="p-4 rounded-xl bg-[#090d16]/70 border border-[#232d42] space-y-2 hover:border-[#d29922]/40 transition-colors">
              <div className="flex items-center gap-2 text-xs text-[#8b949e] font-medium">
                <Activity className="w-4 h-4 text-[#d29922]" />
                <span className="font-semibold text-slate-300">Evaluated Attempts</span>
              </div>
              <div className="text-xl font-bold font-mono text-white">
                {transactions.length} <span className="text-xs text-[#8b949e] font-sans font-normal">Orders</span>
              </div>
              <span className="text-[11px] text-[#8b949e] block">Total processed policy evaluations</span>
            </div>

          </div>
        </div>

        {/* INTUITIVE TABBED NAVIGATION BAR (No emojis, clean vector icons) */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1f2638] pb-3">
          <button
            onClick={() => setActiveTab("copilot")}
            className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "copilot"
                ? "bg-[#2f81f7] text-white shadow-lg shadow-[#2f81f7]/25 border border-[#38bdf8]/40"
                : "bg-[#131927] text-[#8b949e] hover:text-white hover:bg-[#161f33] border border-[#232d42]"
            }`}
          >
            <Bot className="w-4 h-4 text-[#38bdf8]" />
            <span>AI Copilot & Intent Parser</span>
          </button>

          <button
            onClick={() => setActiveTab("rules")}
            className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "rules"
                ? "bg-[#2f81f7] text-white shadow-lg shadow-[#2f81f7]/25 border border-[#38bdf8]/40"
                : "bg-[#131927] text-[#8b949e] hover:text-white hover:bg-[#161f33] border border-[#232d42]"
            }`}
          >
            <Sliders className="w-4 h-4 text-[#38bdf8]" />
            <span>Policy Rules & Caps</span>
          </button>

          <button
            onClick={() => setActiveTab("transactions")}
            className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "transactions"
                ? "bg-[#2f81f7] text-white shadow-lg shadow-[#2f81f7]/25 border border-[#38bdf8]/40"
                : "bg-[#131927] text-[#8b949e] hover:text-white hover:bg-[#161f33] border border-[#232d42]"
            }`}
          >
            <Activity className="w-4 h-4 text-[#38bdf8]" />
            <span>Live Activity Feed ({transactions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("audit")}
            className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "audit"
                ? "bg-[#2f81f7] text-white shadow-lg shadow-[#2f81f7]/25 border border-[#38bdf8]/40"
                : "bg-[#131927] text-[#8b949e] hover:text-white hover:bg-[#161f33] border border-[#232d42]"
            }`}
          >
            <FileText className="w-4 h-4 text-[#38bdf8]" />
            <span>Audit Log ({filteredAuditEvents.length})</span>
          </button>
        </div>

        {/* TAB 1: AI COPILOT & INTENT PARSER */}
        {activeTab === "copilot" && (
          <div className="bg-[#131927] border border-[#1f2638] rounded-2xl p-6 space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#232d42] pb-4">
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#38bdf8]" /> AI Transaction Intent Copilot
                </h2>
                <p className="text-xs text-[#8b949e]">
                  Enter plain language payment requests (e.g., "Buy groceries for ₹800"). The AI parses the request and CircuitBreaker enforces payment rules before calling Razorpay.
                </p>
              </div>
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendIntent(intentInput);
              }}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={intentInput}
                  onChange={(e) => setIntentInput(e.target.value)}
                  placeholder="e.g. Buy groceries from my usual store for around ₹1500"
                  className="flex-1 bg-[#090d16] border border-[#232d42] rounded-xl px-4 py-3 text-xs font-mono text-white focus:border-[#38bdf8] focus:outline-none placeholder-[#484f58] shadow-inner"
                  required
                />
                <button
                  type="submit"
                  disabled={intentLoading}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#1f6feb] to-[#2f81f7] hover:from-[#2f81f7] hover:to-[#388bfd] text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 disabled:opacity-50 shadow-md"
                >
                  {intentLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>Parse & Evaluate</span>
                </button>
              </div>

              {/* Demo Scenario Chips */}
              <div className="space-y-2 pt-1">
                <span className="text-xs font-mono text-[#8b949e] font-semibold">Click a Demo Scenario to Test:</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePresetIntent("Buy groceries for ₹800")}
                    className="px-3 py-1.5 rounded-lg bg-[#090d16] hover:bg-[#161f33] text-xs font-mono text-[#3fb950] border border-[#2ea043]/40 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#3fb950]" /> ₹800 Groceries (Allowed Scenario)
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePresetIntent("Buy groceries for ₹5000")}
                    className="px-3 py-1.5 rounded-lg bg-[#090d16] hover:bg-[#161f33] text-xs font-mono text-[#f85149] border border-[#f85149]/40 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <XCircle className="w-3.5 h-3.5 text-[#f85149]" /> ₹5,000 Groceries (Over Limit Scenario)
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePresetIntent("Buy something from a gambling website for ₹500")}
                    className="px-3 py-1.5 rounded-lg bg-[#090d16] hover:bg-[#161f33] text-xs font-mono text-[#d29922] border border-[#d29922]/40 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <XCircle className="w-3.5 h-3.5 text-[#d29922]" /> ₹500 Gambling (Blocked Category Scenario)
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePresetIntent("Buy headphones for ₹1200")}
                    className="px-3 py-1.5 rounded-lg bg-[#090d16] hover:bg-[#161f33] text-xs font-mono text-[#a5d6ff] border border-[#232d42] transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Zap className="w-3.5 h-3.5 text-[#38bdf8]" /> ₹1,200 Headphones (Kill Switch Test)
                  </button>
                </div>
              </div>
            </form>

            {/* Results Display */}
            {intentResult && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* AI Interpretation */}
                <div className="p-5 rounded-xl bg-[#090d16] border border-[#232d42] space-y-3 font-mono text-xs shadow-md">
                  <div className="flex items-center justify-between border-b border-[#232d42] pb-2">
                    <span className="font-bold text-[#38bdf8] flex items-center gap-1.5 uppercase">
                      <Bot className="w-4 h-4" /> AI Interpretation
                    </span>
                    <span className="text-[10px] text-[#8b949e]">Extracted Intent</span>
                  </div>

                  {intentResult.intent ? (
                    <div className="space-y-2.5">
                      <div className="flex justify-between py-1 border-b border-[#161f33]">
                        <span className="text-[#8b949e]">Extracted Amount:</span>
                        <span className="font-bold text-white">
                          {intentResult.intent.amount ? formatRupees(intentResult.intent.amount * 100) : "-"}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-[#161f33]">
                        <span className="text-[#8b949e]">Category:</span>
                        <span className="text-[#a5d6ff] capitalize font-semibold">{intentResult.intent.category || "-"}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-[#161f33]">
                        <span className="text-[#8b949e]">Merchant:</span>
                        <span className="text-slate-300">{intentResult.intent.merchant || "Standard Vendor"}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-[#8b949e]">Reason:</span>
                        <span className="text-slate-300 text-right max-w-[200px] truncate">{intentResult.intent.reason || "-"}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-[#f85149] text-center font-mono flex items-center justify-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> {intentResult.error || "Unable to understand transaction intent"}
                    </div>
                  )}
                </div>

                {/* CircuitBreaker Decision */}
                <div className={`p-5 rounded-xl bg-[#090d16] border space-y-3 font-mono text-xs shadow-md ${
                  intentResult.decision?.status === "ALLOWED" ? "border-[#2ea043]/80 shadow-emerald-950/20" : "border-[#f85149]/80 shadow-rose-950/20"
                }`}>
                  <div className="flex items-center justify-between border-b border-[#232d42] pb-2">
                    <span className="font-bold text-[#3fb950] flex items-center gap-1.5 uppercase">
                      <ShieldCheck className="w-4 h-4 text-[#2f81f7]" /> CircuitBreaker Gate Decision
                    </span>
                    <span className="text-[10px] text-[#8b949e]">Governance Check</span>
                  </div>

                  {intentResult.decision ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[#8b949e]">Status:</span>
                        <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${
                          intentResult.decision.status === "ALLOWED"
                            ? "bg-[#1b382b] text-[#3fb950] border border-[#2ea043]"
                            : "bg-[#3c1e21] text-[#f85149] border border-[#f85149]"
                        }`}>
                          {intentResult.decision.status}
                        </span>
                      </div>

                      <div>
                        <span className="text-[#8b949e] block mb-1">Reason:</span>
                        <p className="text-slate-200 bg-[#131927] p-2.5 rounded-lg border border-[#232d42] leading-relaxed">
                          {intentResult.decision.reason}
                        </p>
                      </div>

                      {intentResult.razorpay_order_id && (
                        <div className="pt-2 border-t border-[#232d42] flex items-center justify-between">
                          <span className="text-[#8b949e]">Razorpay Order:</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(intentResult.razorpay_order_id)}
                            className="bg-[#131927] hover:bg-[#202c48] px-3 py-1 rounded-lg border border-[#232d42] text-[#38bdf8] font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>{intentResult.razorpay_order_id}</span>
                            <Copy className="w-3.5 h-3.5 text-[#8b949e]" />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-4 text-[#8b949e] text-center font-mono">
                      No payment attempted (uncertain AI intent).
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quick Direct Payment Test Bar */}
            <div className="pt-4 border-t border-[#232d42] space-y-3">
              <span className="text-xs font-mono text-[#8b949e] font-semibold">1-Click Direct API Payment Tests:</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => handleTestTx(80000, "groceries", "FreshMart")}
                  className="px-3 py-2.5 rounded-xl bg-[#090d16] hover:bg-[#161f33] text-xs font-mono font-medium text-[#3fb950] border border-[#2ea043]/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm hover:border-[#3fb950]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> ₹800 Groceries (Test Pass)
                </button>

                <button
                  onClick={() => handleTestTx(500000, "groceries", "Amazon")}
                  className="px-3 py-2.5 rounded-xl bg-[#090d16] hover:bg-[#161f33] text-xs font-mono font-medium text-[#f85149] border border-[#f85149]/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm hover:border-[#f85149]"
                >
                  <XCircle className="w-3.5 h-3.5" /> ₹5,000 Over-Limit (Test Block)
                </button>

                <button
                  onClick={() => handleTestTx(70000, "gambling", "Casino")}
                  className="px-3 py-2.5 rounded-xl bg-[#090d16] hover:bg-[#161f33] text-xs font-mono font-medium text-[#d29922] border border-[#d29922]/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm hover:border-[#d29922]"
                >
                  <XCircle className="w-3.5 h-3.5" /> ₹700 Gambling (Test Block)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: POLICY RULES & SPENDING CAPS */}
        {activeTab === "rules" && (
          <div className="bg-[#131927] border border-[#1f2638] rounded-2xl p-6 space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#232d42] pb-4">
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#2f81f7]" /> Policy Enforcement & Spending Rules
                </h2>
                <p className="text-xs text-[#8b949e]">
                  Configure spending limits, budget caps, permitted categories, and time windows enforced live by CircuitBreaker.
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetPolicy}
                className="px-3 py-1.5 rounded-xl bg-[#090d16] hover:bg-[#161f33] text-xs font-mono text-[#38bdf8] border border-[#232d42] transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Defaults
              </button>
            </div>

            <form onSubmit={handleSavePolicy} className="space-y-6">
              
              {/* Financial Caps */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-5 rounded-xl bg-[#090d16] border border-[#232d42]">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5 font-mono flex items-center gap-1">
                    Single Purchase Limit (₹)
                  </label>
                  <p className="text-[11px] text-[#8b949e] mb-2">Maximum rupees allowed for any single order</p>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-[#8b949e] font-mono text-sm">₹</span>
                    <input
                      type="number"
                      min="1"
                      value={formLimit}
                      onChange={(e) => setFormLimit(e.target.value)}
                      className="w-full bg-[#131927] border border-[#232d42] rounded-xl pl-8 pr-4 py-2 text-sm font-mono text-white focus:border-[#2f81f7] focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5 font-mono flex items-center gap-1">
                    Daily Spend Budget (₹)
                  </label>
                  <p className="text-[11px] text-[#8b949e] mb-2">Maximum cumulative spend allowed per calendar day</p>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-[#8b949e] font-mono text-sm">₹</span>
                    <input
                      type="number"
                      min="1"
                      value={formBudget}
                      onChange={(e) => setFormBudget(e.target.value)}
                      className="w-full bg-[#131927] border border-[#232d42] rounded-xl pl-8 pr-4 py-2 text-sm font-mono text-white focus:border-[#2f81f7] focus:outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Category Rules */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-5 rounded-xl bg-[#090d16] border border-[#232d42]">
                {/* Allowed Categories */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1 font-mono">Allowed Categories</label>
                    <p className="text-[11px] text-[#8b949e] mb-2">Comma-separated list of permitted purchase types</p>
                    <input
                      type="text"
                      value={formAllowed}
                      onChange={(e) => setFormAllowed(e.target.value)}
                      placeholder="groceries, subscriptions, travel"
                      className="w-full bg-[#131927] border border-[#232d42] rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:border-[#2ea043] focus:outline-none"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {formAllowed.split(",").map((cat, i) => cat.trim() && (
                        <span key={i} className="px-2.5 py-1 rounded-lg bg-[#1b382b] text-[#3fb950] border border-[#2ea043]/50 text-xs font-mono flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> {cat.trim()}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#8b949e]">
                      <span>Add Quick Preset:</span>
                      {["travel", "cloud", "supplies"].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => addCategoryPreset("allowed", preset)}
                          className="px-2 py-0.5 rounded-md bg-[#131927] hover:bg-[#202c48] text-[#38bdf8] border border-[#232d42] text-xs font-mono flex items-center gap-0.5 cursor-pointer"
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Blocked Categories */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1 font-mono">Blocked Categories</label>
                    <p className="text-[11px] text-[#8b949e] mb-2">Comma-separated list of strictly forbidden categories</p>
                    <input
                      type="text"
                      value={formBlocked}
                      onChange={(e) => setFormBlocked(e.target.value)}
                      placeholder="gambling, crypto, luxury"
                      className="w-full bg-[#131927] border border-[#232d42] rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:border-[#f85149] focus:outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {formBlocked.split(",").map((cat, i) => cat.trim() && (
                        <span key={i} className="px-2.5 py-1 rounded-lg bg-[#3c1e21] text-[#f85149] border border-[#f85149]/50 text-xs font-mono flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> {cat.trim()}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#8b949e]">
                      <span>Add Quick Preset:</span>
                      {["gaming", "luxury", "tickets"].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => addCategoryPreset("blocked", preset)}
                          className="px-2 py-0.5 rounded-md bg-[#131927] hover:bg-[#202c48] text-[#f85149] border border-[#232d42] text-xs font-mono flex items-center gap-0.5 cursor-pointer"
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Time Window */}
              <div className="p-5 rounded-xl bg-[#090d16] border border-[#232d42] space-y-3">
                <label className="block text-xs font-semibold text-slate-200 font-mono">Active Payment Window (24h Format)</label>
                <p className="text-[11px] text-[#8b949e]">Transactions outside this daily window are automatically blocked by the gate.</p>
                <div className="grid grid-cols-2 gap-4 max-w-md">
                  <div>
                    <label className="block text-[11px] text-[#8b949e] mb-1">Start Time</label>
                    <input
                      type="time"
                      value={formStart}
                      onChange={(e) => setFormStart(e.target.value)}
                      className="w-full bg-[#131927] border border-[#232d42] rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-[#38bdf8] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#8b949e] mb-1">End Time</label>
                    <input
                      type="time"
                      value={formEnd}
                      onChange={(e) => setFormEnd(e.target.value)}
                      className="w-full bg-[#131927] border border-[#232d42] rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-[#38bdf8] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingPolicy}
                  className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#1f6feb] to-[#2f81f7] hover:from-[#2f81f7] hover:to-[#388bfd] text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50"
                >
                  {savingPolicy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  <span>Save & Enforce Rules</span>
                </button>
              </div>

            </form>
          </div>
        )}

        {/* TAB 3: LIVE PAYMENT ACTIVITY */}
        {activeTab === "transactions" && (
          <div className="bg-[#131927] border border-[#1f2638] rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#232d42] pb-4">
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#2f81f7]" /> Live Transaction Ticker Stream
                </h2>
                <p className="text-xs text-[#8b949e]">
                  Real-time stream of evaluated transaction attempts received via WebSocket live sync.
                </p>
              </div>
              <span className="text-xs text-[#8b949e] font-mono font-semibold">
                {transactions.length} Total Events
              </span>
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {transactions.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-[#8b949e] space-y-3">
                  <CreditCard className="w-10 h-10 stroke-1 text-[#8b949e]" />
                  <p className="text-sm font-medium">No transactions evaluated yet.</p>
                  <p className="text-xs text-[#8b949e] text-center max-w-md">
                    Switch to the "AI Copilot" tab to test AI payment requests, or run the CLI simulator.
                  </p>
                </div>
              ) : (
                transactions.map((tx) => {
                  const isAllowed = tx.decision === "ALLOWED";
                  const timeStr = formatTimeString(tx.timestamp);

                  return (
                    <div
                      key={tx.id || `${tx.timestamp}-${Math.random()}`}
                      className={`p-4 rounded-xl border text-xs bg-[#090d16] transition-all shadow-sm ${
                        isAllowed
                          ? "border-[#2ea043]/60 hover:border-[#2ea043]"
                          : "border-[#f85149]/60 hover:border-[#f85149]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isAllowed ? "bg-[#1b382b] text-[#3fb950]" : "bg-[#3c1e21] text-[#f85149]"}`}>
                            {isAllowed ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-base text-white font-mono">
                                {formatRupees(tx.amount)}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-md bg-[#131927] text-[#e6edf3] border border-[#232d42] font-mono text-[11px] font-semibold">
                                {tx.category}
                              </span>
                              <span className="text-[#8b949e] text-xs">@ {tx.merchant}</span>
                            </div>
                            <p className="text-[#8b949e] mt-1 font-sans text-xs">{tx.reason}</p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`px-3 py-1 rounded-lg text-xs font-bold font-mono uppercase ${
                              isAllowed
                                ? "bg-[#1b382b] text-[#3fb950] border border-[#2ea043]"
                                : "bg-[#3c1e21] text-[#f85149] border border-[#f85149]"
                            }`}
                          >
                            {tx.decision}
                          </span>
                          <div className="text-[11px] text-[#8b949e] font-mono mt-1.5">{timeStr}</div>
                        </div>
                      </div>

                      {/* Razorpay Order ID */}
                      {isAllowed && tx.razorpay_order_id && (
                        <div className="mt-3 pt-2.5 border-t border-[#232d42] flex items-center justify-between text-xs font-mono">
                          <span className="flex items-center gap-1.5 text-[#8b949e]">
                            <Lock className="w-3.5 h-3.5 text-[#2f81f7]" /> Razorpay Order Created:
                          </span>
                          <button
                            onClick={() => copyToClipboard(tx.razorpay_order_id)}
                            className="bg-[#131927] hover:bg-[#202c48] px-3 py-1 rounded-lg border border-[#232d42] font-bold text-[#38bdf8] flex items-center gap-1.5 cursor-pointer"
                            title="Click to copy Razorpay Order ID"
                          >
                            <span>{tx.razorpay_order_id}</span>
                            {copiedOrderId === tx.razorpay_order_id ? (
                              <Check className="w-3.5 h-3.5 text-[#3fb950]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-[#8b949e]" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 4: COMPLIANCE AUDIT LOG */}
        {activeTab === "audit" && (
          <div className="bg-[#131927] border border-[#1f2638] rounded-2xl p-6 space-y-4 font-mono text-xs shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#232d42] pb-4">
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#2f81f7]" /> Compliance Audit Trail & Event Logs
                </h2>
                <p className="text-xs text-[#8b949e] font-sans">
                  Immutable audit trail recording all policy updates, kill switch activations, and payment evaluations.
                </p>
              </div>

              {/* Audit Search & Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#8b949e]" />
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    className="bg-[#090d16] border border-[#232d42] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:border-[#2f81f7] focus:outline-none w-40 sm:w-52"
                  />
                </div>

                <div className="flex items-center gap-1 bg-[#090d16] p-1 rounded-xl border border-[#232d42] text-[11px]">
                  {["ALL", "KILL_SWITCH", "POLICY", "EVALUATION"].map((filterKey) => (
                    <button
                      key={filterKey}
                      onClick={() => setAuditFilter(filterKey)}
                      className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                        auditFilter === filterKey
                          ? "bg-[#202c48] text-[#38bdf8] font-bold"
                          : "text-[#8b949e] hover:text-white"
                      }`}
                    >
                      {filterKey.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
              {filteredAuditEvents.length === 0 ? (
                <p className="text-[#8b949e] text-center py-12 font-sans">No matching audit logs found.</p>
              ) : (
                filteredAuditEvents.map((ev) => {
                  const dateStr = formatDateTimeString(ev.timestamp);
                  const isHuman = ev.actor === "human";

                  return (
                    <div
                      key={ev.id || `${ev.timestamp}-${Math.random()}`}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-[#090d16] border border-[#232d42] text-xs gap-3 hover:border-[#2f81f7]/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <span
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold shrink-0 uppercase tracking-wider ${
                            isHuman
                              ? "bg-[#342415] text-[#d29922] border border-[#d29922]/50"
                              : "bg-[#1f2d3d] text-[#38bdf8] border border-[#38bdf8]/50"
                          }`}
                        >
                          ACTOR: {ev.actor}
                        </span>

                        <span className="font-bold text-[#e6edf3] shrink-0">{ev.event_type}</span>
                        <span className="text-[#8b949e] font-sans truncate">{ev.detail}</span>
                      </div>

                      <span className="text-[#8b949e] text-[11px] shrink-0 font-mono">{dateStr}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-[#1f2638] py-4 text-center text-xs font-mono text-[#8b949e] bg-[#0d121f]">
        CircuitBreaker — Agent Payment Authorization & Governance Engine
      </footer>
    </div>
  );
}

export default App;
