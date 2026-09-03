import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  Power,
  Activity,
  CreditCard,
  Clock,
  Sliders,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Lock,
  DollarSign,
  Tag,
  ArrowRight,
  TrendingUp,
  Cpu
} from 'lucide-react';

const API_BASE = "http://127.0.0.1:8000";
const WS_BASE = "ws://127.0.0.1:8000";

function formatRupees(paise) {
  if (paise == null) return "₹0";
  const rupees = paise / 100;
  if (Number.isInteger(rupees)) {
    return `₹${rupees.toLocaleString('en-IN')}`;
  }
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  // Policy Form State
  const [formLimit, setFormLimit] = useState(2000);
  const [formBudget, setFormBudget] = useState(10000);
  const [formAllowed, setFormAllowed] = useState("groceries, subscriptions");
  const [formBlocked, setFormBlocked] = useState("gambling, crypto");
  const [formStart, setFormStart] = useState("09:00");
  const [formEnd, setFormEnd] = useState("21:00");

  // Audit filter state
  const [auditFilter, setAuditFilter] = useState("ALL");

  const wsRef = useRef(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
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
            // Also refresh audit events
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

  // Kill switch handler
  const handleKillToggle = async () => {
    const isKilled = policy.status === "KILLED";
    const endpoint = isKilled ? `${API_BASE}/agents/${agentId}/resume` : `${API_BASE}/agents/${agentId}/kill`;
    
    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPolicy((prev) => ({ ...prev, status: data.status }));
        showToast(
          isKilled ? "Agent payment authority restored successfully" : "EMERGENCY: Kill Switch Activated! Agent disabled.",
          isKilled ? "success" : "error"
        );
      } else {
        showToast("Failed to toggle kill switch", "error");
      }
    } catch (err) {
      showToast("Network error toggling kill switch", "error");
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
          `Test Tx (${formatRupees(amountPaise)}): ${data.decision} - ${data.reason}`,
          data.decision === "ALLOWED" ? "success" : "error"
        );
      }
    } catch (err) {
      showToast("Error triggering test transaction", "error");
    }
  };

  // Calculate daily spent total from allowed transactions today
  const todaySpentPaise = transactions
    .filter((t) => t.decision === "ALLOWED")
    .reduce((sum, t) => sum + t.amount, 0);

  const isKilled = policy.status === "KILLED";
  const budgetProgressPercent = Math.min(100, (todaySpentPaise / policy.daily_budget) * 100);

  // Filter audit events
  const filteredAuditEvents = auditEvents.filter((ev) => {
    if (auditFilter === "ALL") return true;
    if (auditFilter === "KILL_SWITCH") return ev.event_type === "KILL_SWITCH_TOGGLED";
    if (auditFilter === "POLICY") return ev.event_type === "POLICY_CHANGED";
    if (auditFilter === "EVALUATION") return ev.event_type === "TX_EVALUATED";
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 border backdrop-blur-md transition-all duration-300 animate-bounce ${
            toast.type === "error"
              ? "bg-rose-950/90 border-rose-500/50 text-rose-200 glow-rose"
              : "bg-emerald-950/90 border-emerald-500/50 text-emerald-200 glow-emerald"
          }`}
        >
          {toast.type === "error" ? <AlertTriangle className="w-5 h-5 text-rose-400" /> : <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20">
              <Zap className="w-6 h-6 text-slate-950 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">CIRCUITBREAKER</h1>
                <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                  v1.0 Razorpay Buildathon
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Agent Authorization & Payment Policy Enforcement Layer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Realtime Status Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-medium">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  wsStatus === "CONNECTED"
                    ? "bg-emerald-500 animate-pulse glow-emerald"
                    : wsStatus === "CONNECTING"
                    ? "bg-amber-500 animate-ping"
                    : "bg-rose-500"
                }`}
              />
              <span className="text-slate-300">
                {wsStatus === "CONNECTED"
                  ? "SYSTEM ONLINE (WS LIVE)"
                  : wsStatus === "CONNECTING"
                  ? "CONNECTING..."
                  : "WEBSOCKET OFF"}
              </span>
            </div>

            {/* Refresh button */}
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-cyan-400" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* HERO SECTION: KILL SWITCH & STATUS */}
        <div
          className={`relative rounded-2xl p-6 sm:p-8 transition-all duration-500 overflow-hidden border ${
            isKilled
              ? "bg-gradient-to-r from-rose-950/80 via-slate-900 to-rose-950/60 border-rose-600/60 glow-rose animate-pulse-ring"
              : "bg-slate-900/80 border-slate-800 glow-cyan"
          }`}
        >
          {/* Background grid accent */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-25" />

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            
            {/* Agent Info & Status */}
            <div className="space-y-3 text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700 text-xs font-mono text-slate-300">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>AGENT #{agentId}: {agent?.name || "ShoppingBot"}</span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400">KEY: {agent?.api_key || "sb_key_..."}</span>
              </div>

              <div className="flex items-center justify-center md:justify-start gap-4">
                <div
                  className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl border font-bold text-lg sm:text-xl tracking-wide ${
                    isKilled
                      ? "bg-rose-500/20 text-rose-400 border-rose-500/40 glow-rose"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 glow-emerald"
                  }`}
                >
                  {isKilled ? (
                    <>
                      <ShieldAlert className="w-7 h-7 text-rose-500 animate-bounce" />
                      <span>AUTHORIZATION REVOKED (KILLED)</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-7 h-7 text-emerald-400" />
                      <span>AGENT ACTIVE & AUTHORIZED</span>
                    </>
                  )}
                </div>
              </div>

              <p className="text-sm text-slate-400 max-w-xl">
                {isKilled
                  ? "🚨 All incoming agent transactions are instantly blocked before reaching Razorpay. Click 'RESUME' to restore payment authority."
                  : "🟢 Every transaction is evaluated against strict spend caps, category whitelists, and time windows before creating Razorpay orders."}
              </p>
            </div>

            {/* Giant Kill Switch Button */}
            <div className="w-full md:w-auto flex flex-col items-center">
              <button
                onClick={handleKillToggle}
                className={`w-full sm:w-72 px-8 py-5 rounded-2xl font-black tracking-wider text-base uppercase flex items-center justify-center gap-3 shadow-2xl transition-all duration-300 transform active:scale-95 cursor-pointer ${
                  isKilled
                    ? "bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-600 hover:from-emerald-500 hover:to-teal-400 text-slate-950 shadow-emerald-500/30 glow-emerald"
                    : "bg-gradient-to-r from-rose-600 via-red-500 to-rose-700 hover:from-rose-500 hover:to-red-600 text-white shadow-rose-600/40 glow-rose"
                }`}
              >
                <Power className="w-6 h-6 stroke-[3]" />
                <span>{isKilled ? "RESUME AGENT" : "KILL SWITCH"}</span>
              </button>
              <span className="text-[11px] font-mono text-slate-500 mt-2">
                {isKilled ? "Click to reinstate agent payment authority" : "Click to instantly freeze agent spending"}
              </span>
            </div>

          </div>

          {/* Quick Stats Grid */}
          <div className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Per-Tx Limit</span>
              <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                {formatRupees(policy.per_transaction_limit)}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Daily Budget</span>
              <div className="text-xl font-bold text-slate-100 font-mono mt-1">
                {formatRupees(policy.daily_budget)}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Spent Today</span>
              <div className="text-xl font-bold text-cyan-400 font-mono mt-1">
                {formatRupees(todaySpentPaise)}
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-cyan-500 h-full transition-all duration-500"
                  style={{ width: `${budgetProgressPercent}%` }}
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Active Window</span>
              <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                {policy.active_window_start || "00:00"} - {policy.active_window_end || "23:59"}
              </div>
            </div>
          </div>
        </div>

        {/* MIDDLE SECTION: SPLIT PANELS (POLICY EDITOR vs LIVE TRANSACTION FEED) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* LEFT: POLICY CONFIGURATION EDITOR (5 Cols) */}
          <div className="lg:col-span-5 bg-slate-900/80 rounded-2xl p-6 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
                <Sliders className="w-5 h-5 text-cyan-400" />
                <h2 className="text-base font-bold text-white tracking-wide">POLICY ENFORCEMENT RULES</h2>
              </div>

              <form onSubmit={handleSavePolicy} className="space-y-4">
                {/* Limits */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1 font-medium">Per-Transaction (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-500 font-mono text-sm">₹</span>
                      <input
                        type="number"
                        min="1"
                        value={formLimit}
                        onChange={(e) => setFormLimit(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-7 pr-3 py-2 text-sm text-slate-100 font-mono focus:border-cyan-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1 font-medium">Daily Budget (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-500 font-mono text-sm">₹</span>
                      <input
                        type="number"
                        min="1"
                        value={formBudget}
                        onChange={(e) => setFormBudget(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-7 pr-3 py-2 text-sm text-slate-100 font-mono focus:border-cyan-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Categories */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">
                    Allowed Categories <span className="text-slate-500 font-normal">(comma-separated)</span>
                  </label>
                  <input
                    type="text"
                    value={formAllowed}
                    onChange={(e) => setFormAllowed(e.target.value)}
                    placeholder="groceries, subscriptions, travel"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {formAllowed.split(",").map((cat, i) => cat.trim() && (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono">
                        ✓ {cat.trim()}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">
                    Blocked Categories <span className="text-slate-500 font-normal">(comma-separated)</span>
                  </label>
                  <input
                    type="text"
                    value={formBlocked}
                    onChange={(e) => setFormBlocked(e.target.value)}
                    placeholder="gambling, crypto, luxury"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono focus:border-rose-500 focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {formBlocked.split(",").map((cat, i) => cat.trim() && (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-mono">
                        ✕ {cat.trim()}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Active Window */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1 font-medium">Active Window Start</label>
                    <input
                      type="text"
                      value={formStart}
                      onChange={(e) => setFormStart(e.target.value)}
                      placeholder="09:00"
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono focus:border-cyan-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1 font-medium">Active Window End</label>
                    <input
                      type="text"
                      value={formEnd}
                      onChange={(e) => setFormEnd(e.target.value)}
                      placeholder="21:00"
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingPolicy}
                  className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm uppercase tracking-wider transition-all duration-200 shadow-lg shadow-cyan-500/20 active:scale-98 cursor-pointer"
                >
                  {savingPolicy ? "Enforcing Rules..." : "UPDATE & ENFORCE POLICY"}
                </button>
              </form>
            </div>

            {/* Quick Interactive Scenario Simulator Buttons */}
            <div className="mt-6 pt-4 border-t border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Quick Test Scenarios (Manual Fire)
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleTestTx(80000, "groceries", "FreshMart")}
                  className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-emerald-300 border border-slate-700 transition-colors text-center"
                >
                  ₹800 Groceries
                </button>

                <button
                  onClick={() => handleTestTx(500000, "groceries", "Amazon")}
                  className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-rose-300 border border-slate-700 transition-colors text-center"
                >
                  ₹5,000 Over Limit
                </button>

                <button
                  onClick={() => handleTestTx(70000, "gambling", "Casino")}
                  className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-amber-300 border border-slate-700 transition-colors text-center"
                >
                  ₹700 Gambling
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: LIVE TRANSACTION FEED (7 Cols) */}
          <div className="lg:col-span-7 bg-slate-900/80 rounded-2xl p-6 border border-slate-800 flex flex-col h-[600px]">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
                <h2 className="text-base font-bold text-white tracking-wide">LIVE TRANSACTION EVALUATION FEED</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {transactions.length} Evaluation{transactions.length === 1 ? "" : "s"}
              </span>
            </div>

            {/* Transaction Stream Scroll Container */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {transactions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
                  <CreditCard className="w-12 h-12 stroke-1 text-slate-600" />
                  <p className="text-sm font-medium">No transactions evaluated yet.</p>
                  <p className="text-xs text-slate-600 text-center max-w-xs">
                    Run the AI Agent simulator or click quick test buttons to evaluate transactions live.
                  </p>
                </div>
              ) : (
                transactions.map((tx) => {
                  const isAllowed = tx.decision === "ALLOWED";
                  const timeStr = new Date(tx.timestamp).toLocaleTimeString();

                  return (
                    <div
                      key={tx.id || `${tx.timestamp}-${Math.random()}`}
                      className={`p-4 rounded-xl border transition-all duration-300 hover:translate-x-1 ${
                        isAllowed
                          ? "bg-slate-950/70 border-emerald-500/30 hover:border-emerald-500/60"
                          : "bg-slate-950/70 border-rose-500/30 hover:border-rose-500/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-xl border ${
                              isAllowed
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                            }`}
                          >
                            {isAllowed ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-base text-white font-mono">
                                {formatRupees(tx.amount)}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                                {tx.category}
                              </span>
                              <span className="text-xs text-slate-400">@ {tx.merchant}</span>
                            </div>
                            <p className="text-xs text-slate-300 mt-1">{tx.reason}</p>
                          </div>
                        </div>

                        <div className="text-right flex flex-col items-end">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-black tracking-wider ${
                              isAllowed
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            }`}
                          >
                            {tx.decision}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono mt-1">{timeStr}</span>
                        </div>
                      </div>

                      {/* Razorpay Order ID Pill */}
                      {isAllowed && tx.razorpay_order_id && (
                        <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-cyan-400">
                          <span className="flex items-center gap-1">
                            <Lock className="w-3 h-3 text-cyan-500" />
                            Razorpay Order Created:
                          </span>
                          <span className="bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/50 font-bold">
                            {tx.razorpay_order_id}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* BOTTOM SECTION: AUDIT LOG TIMELINE */}
        <div className="bg-slate-900/80 rounded-2xl p-6 border border-slate-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-cyan-400" />
              <h2 className="text-base font-bold text-white tracking-wide">HUMAN & SYSTEM AUDIT TRAIL</h2>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              {["ALL", "KILL_SWITCH", "POLICY", "EVALUATION"].map((filterKey) => (
                <button
                  key={filterKey}
                  onClick={() => setAuditFilter(filterKey)}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                    auditFilter === filterKey
                      ? "bg-slate-800 text-cyan-400 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {filterKey.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {filteredAuditEvents.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No matching audit events logged.</p>
            ) : (
              filteredAuditEvents.map((ev) => {
                const dateStr = new Date(ev.timestamp).toLocaleString();
                const isHuman = ev.actor === "human";

                return (
                  <div
                    key={ev.id || `${ev.timestamp}-${Math.random()}`}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs font-mono hover:bg-slate-950 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isHuman
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                        }`}
                      >
                        {ev.actor.toUpperCase()}
                      </span>

                      <span className="font-bold text-slate-300">{ev.event_type}</span>

                      <span className="text-slate-400 font-sans truncate max-w-lg">{ev.detail}</span>
                    </div>

                    <span className="text-slate-500 text-[11px] shrink-0">{dateStr}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500 bg-slate-950">
        <p>CircuitBreaker — Razorpay AI Buildathon 2026 Open Track</p>
      </footer>
    </div>
  );
}

export default App;
