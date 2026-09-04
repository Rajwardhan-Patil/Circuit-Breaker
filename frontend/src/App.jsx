import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Power,
  Zap,
  Activity,
  Sliders,
  FileText,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  Check,
  Plus,
  Search,
  Clock,
  Sparkles,
  Send,
  Bot,
  AlertTriangle,
  ChevronRight,
  SlidersHorizontal,
  Terminal,
  RotateCcw,
  Key,
  User,
  ExternalLink,
  CreditCard,
  Wallet,
  ArrowUpRight,
  Lock,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  UserCheck
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
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function formatDateTimeString(ts) {
  const date = parseUtcTimestamp(ts);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day} ${time}`;
}

function App() {
  const [agentId, setAgentId] = useState(1);
  const [agent, setAgent] = useState(null);
  const [policy, setPolicy] = useState({
    per_transaction_limit: 200000,
    daily_budget: 1000000,
    allowed_categories: ["groceries", "subscriptions"],
    blocked_categories: ["gambling", "crypto"],
    active_window_start: "00:00",
    active_window_end: "23:59",
    status: "ACTIVE"
  });

  const [transactions, setTransactions] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [wsStatus, setWsStatus] = useState("CONNECTING");
  const [loading, setLoading] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [toast, setToast] = useState(null);
  const [copiedOrderId, setCopiedOrderId] = useState(null);
  const [copiedApiKey, setCopiedApiKey] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [txSearch, setTxSearch] = useState("");

  // ChatGPT-Style Sidebar Toggle State (Click logo / icon to toggle)
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Navigation View State: "CONTROL" | "AGENTS" | "TRANSACTIONS" | "AI INTENT" | "POLICIES" | "AUDIT"
  const [navSection, setNavSection] = useState("CONTROL");

  // Policy Form State
  const [formLimit, setFormLimit] = useState(2000);
  const [formBudget, setFormBudget] = useState(10000);
  const [formAllowed, setFormAllowed] = useState("groceries, subscriptions");
  const [formBlocked, setFormBlocked] = useState("gambling, crypto");
  const [formStart, setFormStart] = useState("00:00");
  const [formEnd, setFormEnd] = useState("23:59");
  const [showPolicyEditor, setShowPolicyEditor] = useState(false);

  // Audit Filter State
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

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

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
          setFormStart(agentData.policy.active_window_start || "00:00");
          setFormEnd(agentData.policy.active_window_end || "23:59");
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
      console.error("Failed to fetch data:", err);
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
        setFormStart(updatedPol.active_window_start || "00:00");
        setFormEnd(updatedPol.active_window_end || "23:59");
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
        setShowPolicyEditor(false);
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

  const addCategoryPreset = (target, category) => {
    if (target === "allowed") {
      const current = formAllowed.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (!current.includes(category.toLowerCase())) {
        setFormAllowed([...current, category.toLowerCase()].join(", "));
      }
    } else {
      const current = formBlocked.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (!current.includes(category.toLowerCase())) {
        setFormBlocked([...current, category.toLowerCase()].join(", "));
      }
    }
  };

  const copyToClipboard = (text, type = "order") => {
    navigator.clipboard.writeText(text);
    if (type === "api") {
      setCopiedApiKey(true);
      showToast("Copied Agent API Key to clipboard");
      setTimeout(() => setCopiedApiKey(false), 2000);
    } else {
      setCopiedOrderId(text);
      showToast(`Copied Order ID: ${text}`);
      setTimeout(() => setCopiedOrderId(null), 2000);
    }
  };

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
      showToast("Error executing test transaction", "error");
    }
  };

  // Calculate daily spend
  const todayIsoDate = new Date().toISOString().split('T')[0];
  const todaySpentPaise = transactions
    .filter((t) => t.decision === "ALLOWED" && t.timestamp && t.timestamp.startsWith(todayIsoDate))
    .reduce((sum, t) => sum + t.amount, 0);

  const isKilled = policy.status === "KILLED";
  const dailyBudgetPaise = policy.daily_budget || 1;
  const budgetProgressPercent = Math.min(100, Math.round((todaySpentPaise / dailyBudgetPaise) * 100));

  // Filtered transactions
  const filteredTransactions = transactions.filter((tx) => {
    if (!txSearch.trim()) return true;
    const q = txSearch.toLowerCase();
    return (
      tx.category.toLowerCase().includes(q) ||
      tx.merchant.toLowerCase().includes(q) ||
      tx.reason.toLowerCase().includes(q) ||
      tx.decision.toLowerCase().includes(q) ||
      (tx.razorpay_order_id && tx.razorpay_order_id.toLowerCase().includes(q))
    );
  });

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

  const navigationItems = [
    { id: "CONTROL", label: "Overview", icon: LayoutDashboard },
    { id: "AGENTS", label: "Agent Manager", icon: UserCheck },
    { id: "TRANSACTIONS", label: "Live Transactions", icon: CreditCard, count: transactions.length },
    { id: "AI INTENT", label: "AI Intent Copilot", icon: Sparkles },
    { id: "POLICIES", label: "Policy Engine", icon: Sliders },
    { id: "AUDIT", label: "Audit Log", icon: FileText, count: filteredAuditEvents.length }
  ];

  return (
    <div className="min-h-screen bg-[#090B0D] text-[#E5E7E8] font-sans antialiased flex flex-col">
      
      {/* Toast Banner */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div
            className={`px-4 py-2.5 rounded-md border text-xs font-mono flex items-center gap-2.5 bg-[#101417] shadow-xl ${
              toast.type === "error"
                ? "border-[#E24B4B]/60 text-[#E24B4B]"
                : "border-[#55C96B]/60 text-[#55C96B]"
            }`}
          >
            {toast.type === "error" ? <XCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* TOP HEADER NAVBAR WITH CHATGPT-STYLE SIDEBAR TOGGLE & LOGO */}
      <header className="border-b border-[#252C30] bg-[#101417] h-14 shrink-0 px-4 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          {/* Logo & Brand Title as the primary Sidebar Toggle (ChatGPT Style) */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center gap-2.5 px-2 py-1.5 -ml-2 rounded-md hover:bg-[#14191C] text-left transition-all cursor-pointer group border border-transparent hover:border-[#252C30]"
            title={sidebarOpen ? "Click logo to collapse sidebar" : "Click logo to expand sidebar"}
          >
            <img src="/logo.svg" alt="CircuitBreaker Logo" className="w-6 h-6 rounded-md group-hover:scale-105 transition-transform" />
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white tracking-tight text-sm font-sans group-hover:text-[#4FA3D1] transition-colors">
                CircuitBreaker
              </span>
              <PanelLeft className={`w-3.5 h-3.5 text-[#7D878D] group-hover:text-white transition-all ${sidebarOpen ? "" : "rotate-180"}`} />
            </div>
          </button>

          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#14191C] text-[#4FA3D1] border border-[#252C30] font-medium hidden sm:inline">
            Razorpay Gate
          </span>
        </div>


        <div className="flex items-center gap-4 text-xs">
          {/* WebSocket Status */}
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span
              className={`w-2 h-2 rounded-full ${
                wsStatus === "CONNECTED"
                  ? "bg-[#55C96B]"
                  : wsStatus === "CONNECTING"
                  ? "bg-[#D6A94A] animate-pulse"
                  : "bg-[#E24B4B]"
              }`}
            />
            <span className={wsStatus === "CONNECTED" ? "text-[#55C96B] font-semibold" : "text-[#7D878D]"}>
              {wsStatus === "CONNECTED" ? "LIVE SYNC ACTIVE" : wsStatus}
            </span>
          </div>

          {/* Real-time Clock */}
          <div className="hidden sm:flex items-center gap-1.5 text-[#E5E7E8] font-mono font-medium border-l border-r border-[#252C30] px-3 py-1 text-[11px]">
            <Clock className="w-3.5 h-3.5 text-[#4FA3D1]" />
            <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
          </div>

          {/* Sync Button */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-1 bg-[#14191C] hover:bg-[#252C30] border border-[#252C30] rounded-md text-[#E5E7E8] flex items-center gap-1.5 cursor-pointer text-xs font-mono transition-colors"
            title="Sync latest data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#4FA3D1]" : "text-[#7D878D]"}`} />
            <span className="hidden sm:inline">Sync</span>
          </button>
        </div>
      </header>

      {/* OPERATOR WORKSPACE WITH CHATGPT-STYLE SIDEBAR */}
      <div className="flex-1 flex overflow-hidden">

        {/* CHATGPT-STYLE SIDEBAR (TOGGLEABLE & FULLY WORKING NAV) */}
        <aside
          className={`bg-[#101417] border-r border-[#252C30] shrink-0 transition-all duration-200 flex flex-col justify-between overflow-y-auto ${
            sidebarOpen ? "w-60 p-4" : "w-14 py-4 px-2 items-center"
          }`}
        >
          <div className="space-y-6 w-full">
            
            {/* Sidebar Navigation Menu */}
            <div className="space-y-2">
              {sidebarOpen && (
                <div className="font-mono text-[11px] font-semibold text-[#7D878D] uppercase tracking-wider px-2 pb-1 border-b border-[#252C30]">
                  NAVIGATION
                </div>
              )}

              <nav className="space-y-1">
                {navigationItems.map((item) => {
                  const Icon = item.icon;
                  const isSelected = navSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setNavSection(item.id)}
                      className={`w-full text-left rounded-md flex items-center gap-3 cursor-pointer transition-all ${
                        sidebarOpen ? "px-3 py-2 text-xs" : "p-2.5 justify-center"
                      } ${
                        isSelected
                          ? "bg-[#14191C] text-white border-l-2 border-[#55C96B] font-semibold"
                          : "text-[#7D878D] hover:text-[#E5E7E8] hover:bg-[#14191C]/50"
                      }`}
                      title={!sidebarOpen ? item.label : undefined}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isSelected ? "text-[#55C96B]" : "text-[#7D878D]"}`} />
                      {sidebarOpen && (
                        <div className="flex-1 flex items-center justify-between font-sans">
                          <span>{item.label}</span>
                          {item.count !== undefined && (
                            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-[#090B0D] text-[#7D878D] border border-[#252C30]">
                              {item.count}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Sidebar Active Agent Info Box (Visible when open) */}
            {sidebarOpen && (
              <div className="bg-[#090B0D] border border-[#252C30] p-3 rounded-md space-y-2 font-mono text-xs">
                <div className="text-[#7D878D] text-[10px] uppercase font-semibold">ACTIVE AGENT</div>
                <div className="text-white font-bold truncate">{agent?.name || "ShoppingBot"}</div>
                <div className="text-[#7D878D] text-[11px] truncate">ID: {agent?.api_key || "sb_key_123"}</div>
                <div className="pt-1">
                  {isKilled ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#E24B4B]">
                      ● REVOKED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#55C96B]">
                      ● AUTHORIZED
                    </span>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Sidebar Footer Collapse Toggle */}
          {sidebarOpen && (
            <div className="pt-4 border-t border-[#252C30] text-center w-full">
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-[11px] font-mono text-[#7D878D] hover:text-white transition-colors cursor-pointer"
              >
                [ Collapse Sidebar ]
              </button>
            </div>
          )}
        </aside>

        {/* MAIN WORKSPACE CONTENT AREA */}
        <main className="flex-1 bg-[#090B0D] overflow-y-auto p-4 md:p-6 space-y-6">

          {/* PAGE VIEW 1: OVERVIEW (DEFAULT CONTROL DASHBOARD) */}
          {navSection === "CONTROL" && (
            <div className="space-y-6">
              
              {/* 4 TOP METRIC CARDS GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Daily Spend Tracker */}
                <div className="bg-[#101417] border border-[#252C30] p-4 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#7D878D]">
                    <span className="font-medium">Daily Spend Tracker</span>
                    <span className="font-mono font-semibold text-[#55C96B]">{budgetProgressPercent}%</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-white">
                    {formatRupees(todaySpentPaise)} <span className="text-xs text-[#7D878D] font-normal">/ {formatRupees(policy.daily_budget)}</span>
                  </div>
                  <div className="w-full bg-[#14191C] border border-[#252C30] h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        budgetProgressPercent >= 90
                          ? "bg-[#E24B4B]"
                          : budgetProgressPercent >= 70
                          ? "bg-[#D6A94A]"
                          : "bg-[#55C96B]"
                      }`}
                      style={{ width: `${budgetProgressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Single Purchase Cap */}
                <div className="bg-[#101417] border border-[#252C30] p-4 rounded-lg space-y-2">
                  <div className="text-xs text-[#7D878D] font-medium">Single Purchase Cap</div>
                  <div className="text-xl font-bold font-mono text-white">
                    {formatRupees(policy.per_transaction_limit)}
                  </div>
                  <div className="text-[11px] text-[#7D878D]">Max limit per single transaction</div>
                </div>

                {/* Active Window */}
                <div className="bg-[#101417] border border-[#252C30] p-4 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#7D878D]">
                    <span className="font-medium">Active Time Window</span>
                    <span className="font-mono text-[10px] text-[#4FA3D1]">24H WINDOW</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-[#55C96B]">
                    {policy.active_window_start || "00:00"} – {policy.active_window_end || "23:59"}
                  </div>
                  <div className="text-[11px] text-[#7D878D]">Real-time payment hours allowed</div>
                </div>

                {/* Total Evaluations */}
                <div className="bg-[#101417] border border-[#252C30] p-4 rounded-lg space-y-2">
                  <div className="text-xs text-[#7D878D] font-medium">Processed Evaluations</div>
                  <div className="text-xl font-bold font-mono text-white">
                    {transactions.length} <span className="text-xs text-[#7D878D] font-normal">Requests</span>
                  </div>
                  <div className="text-[11px] text-[#7D878D]">Total evaluated policy checks</div>
                </div>

              </div>

              {/* MAIN SPLIT WORKSPACE: LIVE FEED vs RIGHT CONTROLS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* LEFT: LIVE AUTHORIZATION EVENT STREAM (7 COLS) */}
                <div className="lg:col-span-7 bg-[#101417] border border-[#252C30] rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#252C30] pb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-white font-sans">Live Authorization Feed</h3>
                      <span className="w-2 h-2 rounded-full bg-[#55C96B] animate-pulse" />
                    </div>
                    <span className="font-mono text-xs text-[#7D878D]">{transactions.length} Events</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-xs">
                      <thead>
                        <tr className="border-b border-[#252C30] text-[#7D878D] text-[11px]">
                          <th className="py-2.5 pr-3 font-medium">TIME</th>
                          <th className="py-2.5 pr-3 font-medium">TX ID</th>
                          <th className="py-2.5 pr-3 font-medium">CATEGORY</th>
                          <th className="py-2.5 pr-3 font-medium text-right">AMOUNT</th>
                          <th className="py-2.5 pl-3 font-medium text-center">DECISION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#252C30]">
                        {transactions.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-10 text-center text-[#7D878D] font-sans">
                              No evaluated payment requests yet.
                            </td>
                          </tr>
                        ) : (
                          transactions.slice(0, 15).map((tx, idx) => {
                            const isAllowed = tx.decision === "ALLOWED";
                            const txId = tx.id ? `TX-${String(tx.id).padStart(4, '0')}` : `TX-${String(transactions.length - idx).padStart(4, '0')}`;
                            const timeStr = formatTimeString(tx.timestamp);

                            return (
                              <tr key={tx.id || `${tx.timestamp}-${idx}`} className="hover:bg-[#14191C]/60 transition-colors">
                                <td className="py-3 pr-3 text-[#7D878D] whitespace-nowrap">{timeStr}</td>
                                <td className="py-3 pr-3 text-[#E5E7E8] font-semibold whitespace-nowrap">{txId}</td>
                                <td className="py-3 pr-3 text-[#4FA3D1] whitespace-nowrap">{tx.category}</td>
                                <td className="py-3 pr-3 text-[#E5E7E8] text-right font-bold whitespace-nowrap">{formatRupees(tx.amount)}</td>
                                <td className="py-3 pl-3 text-center whitespace-nowrap">
                                  {isAllowed ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#142E1B] text-[#4ADE80] border border-[#22C55E]/30">
                                      ALLOW
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#38181A] text-[#F87171] border border-[#EF4444]/30">
                                      BLOCK
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* RIGHT: CONTROLS & AI INTENT (5 COLS) */}
                <div className="lg:col-span-5 space-y-6">
                  
                  {/* SIGNATURE AUTHORITY CONTROL MODULE */}
                  <div className={`border rounded-lg p-5 space-y-4 transition-colors ${
                    isKilled ? "bg-[#14191C] border-[#E24B4B]" : "bg-[#101417] border-[#252C30]"
                  }`}>
                    <div className="flex items-center justify-between border-b border-[#252C30] pb-3">
                      <span className="font-semibold text-xs text-white uppercase tracking-wider font-mono">Authority Control</span>
                      <span className="text-xs text-[#7D878D] font-mono">SHOPPINGBOT</span>
                    </div>

                    <div className="flex items-center justify-between font-mono text-xs">
                      <span className="text-[#7D878D]">CURRENT STATE</span>
                      {isKilled ? (
                        <span className="text-[#E24B4B] font-bold tracking-wider">● AUTHORITY REVOKED</span>
                      ) : (
                        <span className="text-[#55C96B] font-bold tracking-wider">● AUTHORITY ACTIVE</span>
                      )}
                    </div>

                    <button
                      onClick={handleKillToggle}
                      className={`w-full py-3 px-4 font-mono text-xs font-bold uppercase tracking-wider rounded-md border transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                        isKilled
                          ? "bg-[#16A34A] hover:bg-[#22C55E] text-white border-[#22C55E]"
                          : "bg-[#DC2626] hover:bg-[#EF4444] text-white border-[#EF4444]"
                      }`}
                    >
                      <Power className="w-4 h-4" />
                      <span>{isKilled ? "Restore Payment Authority" : "Revoke Payment Authority (Kill Switch)"}</span>
                    </button>

                    <div className="bg-[#090B0D] border border-[#252C30] p-3 rounded-md text-xs font-mono space-y-1">
                      <div className="text-[#D6A94A] font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Warning</span>
                      </div>
                      <p className="text-[#7D878D] text-[11px] leading-relaxed">
                        {isKilled
                          ? "Payment authority is currently cut. Subsequent payment requests will be rejected immediately."
                          : "Activating the kill switch immediately revokes spending authority for this agent."}
                      </p>
                    </div>
                  </div>

                  {/* AI INTENT PARSER MODULE */}
                  <div className="bg-[#101417] border border-[#252C30] rounded-lg p-5 space-y-4">
                    <div className="border-b border-[#252C30] pb-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-xs text-white uppercase tracking-wider font-mono">AI Intent Parser</h3>
                        <span className="text-[10px] font-mono text-[#4FA3D1] bg-[#14191C] px-2 py-0.5 rounded border border-[#252C30]">Copilot</span>
                      </div>
                      <p className="text-[11px] text-[#7D878D] font-sans">
                        AI interprets request intent. CircuitBreaker enforces payment rules.
                      </p>
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSendIntent(intentInput);
                      }}
                      className="space-y-3 font-mono text-xs"
                    >
                      <input
                        type="text"
                        value={intentInput}
                        onChange={(e) => setIntentInput(e.target.value)}
                        placeholder="Buy groceries for ₹800"
                        className="w-full bg-[#090B0D] border border-[#252C30] rounded-md px-3.5 py-2 text-xs text-[#E5E7E8] focus:border-[#4FA3D1] focus:outline-none"
                        required
                      />
                      <button
                        type="submit"
                        disabled={intentLoading}
                        className="w-full py-2.5 bg-[#14191C] hover:bg-[#252C30] border border-[#252C30] text-white font-bold text-xs uppercase tracking-wider rounded-md transition-colors cursor-pointer flex items-center justify-center gap-2"
                      >
                        {intentLoading ? <RefreshCw className="w-4 h-4 animate-spin text-[#4FA3D1]" /> : <Send className="w-4 h-4 text-[#4FA3D1]" />}
                        <span>Parse & Authorize</span>
                      </button>
                    </form>
                  </div>

                </div>

              </div>
            </div>
          )}

          {/* PAGE VIEW 2: AGENT MANAGER */}
          {navSection === "AGENTS" && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="bg-[#101417] border border-[#252C30] rounded-lg p-6 space-y-6">
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#252C30] pb-4">
                  <div>
                    <span className="text-xs font-mono text-[#7D878D] uppercase tracking-wider">Agent Profile & Governance</span>
                    <h2 className="text-xl font-bold font-sans text-white mt-0.5">
                      {agent?.name || "ShoppingBot"}
                    </h2>
                  </div>

                  <div>
                    {isKilled ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-bold bg-[#38181A] text-[#F87171] border border-[#EF4444]/40">
                        <XCircle className="w-4 h-4" /> REVOKED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-bold bg-[#142E1B] text-[#4ADE80] border border-[#22C55E]/40">
                        <CheckCircle2 className="w-4 h-4" /> AUTHORIZED
                      </span>
                    )}
                  </div>
                </div>

                {/* API Credentials */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                  <div className="bg-[#090B0D] border border-[#252C30] p-4 rounded-md space-y-2">
                    <div className="text-[#7D878D] text-[11px]">AGENT API KEY</div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white font-bold">{agent?.api_key || "sb_key_shoppingbot_123"}</span>
                      <button
                        onClick={() => copyToClipboard(agent?.api_key || "sb_key_shoppingbot_123", "api")}
                        className="p-1.5 bg-[#14191C] hover:bg-[#252C30] border border-[#252C30] rounded text-[#7D878D] hover:text-white cursor-pointer"
                        title="Copy Key"
                      >
                        {copiedApiKey ? <Check className="w-4 h-4 text-[#55C96B]" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#090B0D] border border-[#252C30] p-4 rounded-md space-y-2">
                    <div className="text-[#7D878D] text-[11px]">DATABASE AGENT ID</div>
                    <div className="text-white font-bold">AGENT #{agent?.id || 1}</div>
                  </div>
                </div>

                {/* Authority Switch */}
                <div className={`border rounded-lg p-5 space-y-4 ${isKilled ? "bg-[#14191C] border-[#E24B4B]" : "bg-[#090B0D] border-[#252C30]"}`}>
                  <div className="flex items-center justify-between font-mono text-xs border-b border-[#252C30] pb-3">
                    <span className="font-semibold text-white uppercase">Emergency Revocation Control</span>
                    <span className={isKilled ? "text-[#E24B4B] font-bold" : "text-[#55C96B] font-bold"}>
                      {isKilled ? "REVOKED" : "ACTIVE"}
                    </span>
                  </div>

                  <p className="text-xs text-[#7D878D] font-sans">
                    {isKilled
                      ? "Agent spending authority is currently revoked. All payment requests will be blocked."
                      : "Agent is authorized to evaluate transactions against configured spending limits."}
                  </p>

                  <button
                    onClick={handleKillToggle}
                    className={`w-full py-3 px-4 font-mono text-xs font-bold uppercase tracking-wider rounded-md border transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                      isKilled
                        ? "bg-[#16A34A] hover:bg-[#22C55E] text-white border-[#22C55E]"
                        : "bg-[#DC2626] hover:bg-[#EF4444] text-white border-[#EF4444]"
                    }`}
                  >
                    <Power className="w-4 h-4" />
                    <span>{isKilled ? "Restore Payment Authority" : "Revoke Payment Authority (Kill Switch)"}</span>
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* PAGE VIEW 3: LIVE TRANSACTIONS */}
          {navSection === "TRANSACTIONS" && (
            <div className="space-y-4">
              <div className="bg-[#101417] border border-[#252C30] rounded-lg p-6 space-y-4">
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#252C30] pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-white font-sans">Live Authorization Event Stream</h2>
                    <p className="text-xs text-[#7D878D] font-sans mt-0.5">Real-time evaluated transaction log</p>
                  </div>

                  <div className="relative w-full sm:w-64 font-mono text-xs">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#7D878D]" />
                    <input
                      type="text"
                      placeholder="Search transactions..."
                      value={txSearch}
                      onChange={(e) => setTxSearch(e.target.value)}
                      className="w-full bg-[#090B0D] border border-[#252C30] rounded-md pl-9 pr-3 py-1.5 text-xs text-[#E5E7E8] focus:border-[#4FA3D1] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-[#252C30] text-[#7D878D] text-[11px]">
                        <th className="py-2.5 pr-4 font-medium">TIME</th>
                        <th className="py-2.5 pr-4 font-medium">TX ID</th>
                        <th className="py-2.5 pr-4 font-medium">AGENT</th>
                        <th className="py-2.5 pr-4 font-medium">CATEGORY</th>
                        <th className="py-2.5 pr-4 font-medium">MERCHANT</th>
                        <th className="py-2.5 pr-4 font-medium text-right">AMOUNT</th>
                        <th className="py-2.5 pr-4 font-medium text-center">DECISION</th>
                        <th className="py-2.5 pl-4 font-medium text-right">RAZORPAY ORDER</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#252C30]">
                      {filteredTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-[#7D878D] font-sans">
                            No matching transactions found.
                          </td>
                        </tr>
                      ) : (
                        filteredTransactions.map((tx, idx) => {
                          const isAllowed = tx.decision === "ALLOWED";
                          const txId = tx.id ? `TX-${String(tx.id).padStart(4, '0')}` : `TX-${String(transactions.length - idx).padStart(4, '0')}`;
                          const timeStr = formatTimeString(tx.timestamp);

                          return (
                            <tr key={tx.id || `${tx.timestamp}-${idx}`} className="hover:bg-[#14191C]/60 transition-colors">
                              <td className="py-3 pr-4 text-[#7D878D] whitespace-nowrap">{timeStr}</td>
                              <td className="py-3 pr-4 text-[#E5E7E8] font-bold whitespace-nowrap">{txId}</td>
                              <td className="py-3 pr-4 text-[#7D878D] whitespace-nowrap">SHOPPINGBOT</td>
                              <td className="py-3 pr-4 text-[#4FA3D1] whitespace-nowrap">{tx.category}</td>
                              <td className="py-3 pr-4 text-[#E5E7E8] whitespace-nowrap">{tx.merchant}</td>
                              <td className="py-3 pr-4 text-[#E5E7E8] text-right font-bold whitespace-nowrap">{formatRupees(tx.amount)}</td>
                              <td className="py-3 pr-4 text-center whitespace-nowrap">
                                {isAllowed ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#142E1B] text-[#4ADE80] border border-[#22C55E]/30">
                                    ALLOW
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#38181A] text-[#F87171] border border-[#EF4444]/30">
                                    BLOCK
                                  </span>
                                )}
                              </td>
                              <td className="py-3 pl-4 text-right whitespace-nowrap">
                                {isAllowed && tx.razorpay_order_id ? (
                                  <button
                                    onClick={() => copyToClipboard(tx.razorpay_order_id)}
                                    className="text-[#4FA3D1] font-bold hover:underline cursor-pointer"
                                    title="Click to copy Razorpay Order ID"
                                  >
                                    {tx.razorpay_order_id}
                                  </button>
                                ) : (
                                  <span className="text-[#7D878D]">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            </div>
          )}

          {/* PAGE VIEW 4: AI INTENT COPILOT */}
          {navSection === "AI INTENT" && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="bg-[#101417] border border-[#252C30] rounded-lg p-6 space-y-6">
                
                <div className="border-b border-[#252C30] pb-4 space-y-1">
                  <h2 className="text-base font-semibold text-white font-sans">AI Intent Copilot & Policy Gate</h2>
                  <p className="text-xs text-[#7D878D] font-sans">
                    AI interprets request intent. CircuitBreaker authorizes payment execution.
                  </p>
                </div>

                {/* Form Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendIntent(intentInput);
                  }}
                  className="space-y-3 font-mono text-xs"
                >
                  <label className="block text-[#7D878D] font-medium font-sans">Enter Plain Language Payment Request</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={intentInput}
                      onChange={(e) => setIntentInput(e.target.value)}
                      placeholder="e.g. Buy groceries for around ₹1,500"
                      className="flex-1 bg-[#090B0D] border border-[#252C30] rounded-md px-3.5 py-2.5 text-xs text-[#E5E7E8] focus:border-[#4FA3D1] focus:outline-none"
                      required
                    />
                    <button
                      type="submit"
                      disabled={intentLoading}
                      className="px-5 py-2.5 bg-[#14191C] hover:bg-[#252C30] border border-[#252C30] text-white font-bold text-xs uppercase tracking-wider rounded-md cursor-pointer flex items-center gap-2 shrink-0"
                    >
                      {intentLoading ? <RefreshCw className="w-4 h-4 animate-spin text-[#4FA3D1]" /> : <Send className="w-4 h-4 text-[#4FA3D1]" />}
                      <span>Parse & Authorize</span>
                    </button>
                  </div>

                  {/* Scenario Chips */}
                  <div className="space-y-1.5 pt-2">
                    <span className="text-[#7D878D] text-[11px] font-sans">Demo Scenario Presets:</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handlePresetIntent("Buy groceries for ₹800")}
                        className="px-3 py-1.5 bg-[#090B0D] hover:bg-[#14191C] border border-[#252C30] text-[#55C96B] rounded-md cursor-pointer"
                      >
                        ₹800 Groceries (Allowed)
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePresetIntent("Buy groceries for ₹5000")}
                        className="px-3 py-1.5 bg-[#090B0D] hover:bg-[#14191C] border border-[#252C30] text-[#E24B4B] rounded-md cursor-pointer"
                      >
                        ₹5,000 Over-Limit (Blocked)
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePresetIntent("Buy something from a gambling website for ₹500")}
                        className="px-3 py-1.5 bg-[#090B0D] hover:bg-[#14191C] border border-[#252C30] text-[#D6A94A] rounded-md cursor-pointer"
                      >
                        ₹500 Gambling (Blocked Category)
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePresetIntent("Buy headphones for ₹1200")}
                        className="px-3 py-1.5 bg-[#090B0D] hover:bg-[#14191C] border border-[#252C30] text-[#4FA3D1] rounded-md cursor-pointer"
                      >
                        ₹1,200 Headphones (Kill Switch Test)
                      </button>
                    </div>
                  </div>
                </form>

                {/* Output Split View */}
                {intentResult && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[#252C30] font-mono text-xs">
                    
                    {/* Left: AI Intent */}
                    <div className="bg-[#090B0D] border border-[#252C30] p-4 rounded-md space-y-3">
                      <div className="flex items-center justify-between border-b border-[#252C30] pb-2">
                        <span className="font-semibold text-[#4FA3D1]">1. AI INTERPRETED INTENT</span>
                        <span className="text-[10px] text-[#7D878D]">EXTRACTED</span>
                      </div>

                      {intentResult.intent ? (
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between border-b border-[#252C30] pb-1.5">
                            <span className="text-[#7D878D]">CATEGORY</span>
                            <span className="text-[#4FA3D1] font-bold">{intentResult.intent.category || "unknown"}</span>
                          </div>
                          <div className="flex justify-between border-b border-[#252C30] pb-1.5">
                            <span className="text-[#7D878D]">AMOUNT</span>
                            <span className="text-white font-bold">
                              {intentResult.intent.amount ? formatRupees(intentResult.intent.amount * 100) : "-"}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-[#252C30] pb-1.5">
                            <span className="text-[#7D878D]">MERCHANT</span>
                            <span className="text-white">{intentResult.intent.merchant || "Standard Vendor"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#7D878D]">REASON</span>
                            <span className="text-white truncate max-w-[180px]">{intentResult.intent.reason || "Grocery purchase"}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[#E24B4B] py-3 text-center">
                          {intentResult.error || "Unable to extract intent"}
                        </div>
                      )}
                    </div>

                    {/* Right: Gate Decision */}
                    <div className="bg-[#090B0D] border border-[#252C30] p-4 rounded-md space-y-3">
                      <div className="flex items-center justify-between border-b border-[#252C30] pb-2">
                        <span className="font-semibold text-[#55C96B]">2. CIRCUITBREAKER DECISION</span>
                        <span className="text-[10px] text-[#7D878D]">GATE RESULT</span>
                      </div>

                      {intentResult.decision ? (
                        <div className="space-y-3 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[#7D878D]">STATUS</span>
                            {intentResult.decision.status === "ALLOWED" ? (
                              <span className="text-[#55C96B] font-bold">● ALLOWED</span>
                            ) : (
                              <span className="text-[#E24B4B] font-bold">● BLOCKED</span>
                            )}
                          </div>

                          <div>
                            <span className="text-[#7D878D] block mb-1">EVALUATION REASON</span>
                            <div className="bg-[#101417] p-2.5 border border-[#252C30] rounded text-[#E5E7E8]">
                              {intentResult.decision.reason}
                            </div>
                          </div>

                          {intentResult.razorpay_order_id && (
                            <div className="pt-2 border-t border-[#252C30] flex items-center justify-between">
                              <span className="text-[#7D878D]">RAZORPAY ORDER</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(intentResult.razorpay_order_id)}
                                className="text-[#4FA3D1] font-bold hover:underline cursor-pointer"
                              >
                                {intentResult.razorpay_order_id}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[#7D878D] py-3 text-center">
                          No decision (uncertain AI intent).
                        </div>
                      )}
                    </div>

                  </div>
                )}

              </div>
            </div>
          )}

          {/* PAGE VIEW 5: POLICY ENGINE */}
          {navSection === "POLICIES" && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="bg-[#101417] border border-[#252C30] rounded-lg p-6 space-y-6 font-mono text-xs">
                
                <div className="flex items-center justify-between border-b border-[#252C30] pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-white font-sans">Policy Engine & Spending Caps</h2>
                    <p className="text-xs text-[#7D878D] font-sans mt-0.5">Configure live rules enforced by CircuitBreaker</p>
                  </div>

                  <button
                    type="button"
                    onClick={handleResetPolicy}
                    className="px-3 py-1.5 bg-[#090B0D] hover:bg-[#14191C] border border-[#252C30] text-[#4FA3D1] rounded-md cursor-pointer"
                  >
                    Reset Defaults
                  </button>
                </div>

                <form onSubmit={handleSavePolicy} className="space-y-6">
                  
                  {/* Financial Caps */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 bg-[#090B0D] border border-[#252C30] rounded-md">
                    <div>
                      <label className="block text-[#7D878D] font-bold mb-1">PER TRANSACTION LIMIT (₹)</label>
                      <input
                        type="number"
                        min="1"
                        value={formLimit}
                        onChange={(e) => setFormLimit(e.target.value)}
                        className="w-full bg-[#101417] border border-[#252C30] rounded-md px-3 py-2 text-xs text-white font-bold"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[#7D878D] font-bold mb-1">DAILY BUDGET (₹)</label>
                      <input
                        type="number"
                        min="1"
                        value={formBudget}
                        onChange={(e) => setFormBudget(e.target.value)}
                        className="w-full bg-[#101417] border border-[#252C30] rounded-md px-3 py-2 text-xs text-white font-bold"
                        required
                      />
                    </div>
                  </div>

                  {/* Category Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 bg-[#090B0D] border border-[#252C30] rounded-md">
                    <div className="space-y-2">
                      <label className="block text-[#55C96B] font-bold">ALLOWED CATEGORIES</label>
                      <input
                        type="text"
                        value={formAllowed}
                        onChange={(e) => setFormAllowed(e.target.value)}
                        placeholder="groceries, subscriptions"
                        className="w-full bg-[#101417] border border-[#252C30] rounded-md px-3 py-2 text-xs text-white"
                      />
                      <div className="flex items-center gap-1.5 text-[11px] text-[#7D878D] pt-1">
                        <span>Presets:</span>
                        {["travel", "cloud", "supplies"].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => addCategoryPreset("allowed", p)}
                            className="px-2 py-0.5 bg-[#14191C] hover:bg-[#252C30] border border-[#252C30] text-[#4FA3D1] rounded cursor-pointer"
                          >
                            + {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[#E24B4B] font-bold">BLOCKED CATEGORIES</label>
                      <input
                        type="text"
                        value={formBlocked}
                        onChange={(e) => setFormBlocked(e.target.value)}
                        placeholder="gambling, crypto"
                        className="w-full bg-[#101417] border border-[#252C30] rounded-md px-3 py-2 text-xs text-white"
                      />
                      <div className="flex items-center gap-1.5 text-[11px] text-[#7D878D] pt-1">
                        <span>Presets:</span>
                        {["gaming", "luxury", "tickets"].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => addCategoryPreset("blocked", p)}
                            className="px-2 py-0.5 bg-[#14191C] hover:bg-[#252C30] border border-[#252C30] text-[#E24B4B] rounded cursor-pointer"
                          >
                            + {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Time Window */}
                  <div className="p-4 bg-[#090B0D] border border-[#252C30] rounded-md space-y-3">
                    <label className="block text-[#7D878D] font-bold">ACTIVE TIME WINDOW (24H FORMAT)</label>
                    <div className="grid grid-cols-2 gap-4 max-w-xs">
                      <div>
                        <span className="block text-[11px] text-[#7D878D] mb-1">START</span>
                        <input
                          type="time"
                          value={formStart}
                          onChange={(e) => setFormStart(e.target.value)}
                          className="w-full bg-[#101417] border border-[#252C30] rounded-md px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="block text-[11px] text-[#7D878D] mb-1">END</span>
                        <input
                          type="time"
                          value={formEnd}
                          onChange={(e) => setFormEnd(e.target.value)}
                          className="w-full bg-[#101417] border border-[#252C30] rounded-md px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={savingPolicy}
                      className="px-6 py-2.5 bg-[#16A34A] hover:bg-[#22C55E] text-white font-bold text-xs uppercase tracking-wider rounded-md cursor-pointer transition-colors"
                    >
                      {savingPolicy ? "Saving..." : "Save & Enforce Policy"}
                    </button>
                  </div>

                </form>

              </div>
            </div>
          )}

          {/* VIEW 6: AUDIT LOG */}
          {navSection === "AUDIT" && (
            <div className="space-y-4">
              <div className="bg-[#101417] border border-[#252C30] rounded-lg p-6 space-y-4 font-mono text-xs">
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#252C30] pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-white font-sans">Compliance Audit Trail</h2>
                    <p className="text-xs text-[#7D878D] font-sans mt-0.5">Immutable audit log recording policy enforcement & events</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#7D878D]" />
                      <input
                        type="text"
                        placeholder="Search logs..."
                        value={auditSearch}
                        onChange={(e) => setAuditSearch(e.target.value)}
                        className="bg-[#090B0D] border border-[#252C30] rounded-md pl-9 pr-3 py-1.5 text-xs text-white focus:border-[#4FA3D1] focus:outline-none w-48"
                      />
                    </div>

                    <div className="flex items-center gap-1 bg-[#090B0D] p-1 rounded-md border border-[#252C30]">
                      {["ALL", "KILL_SWITCH", "POLICY", "EVALUATION"].map((filterKey) => (
                        <button
                          key={filterKey}
                          onClick={() => setAuditFilter(filterKey)}
                          className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                            auditFilter === filterKey
                              ? "bg-[#14191C] text-[#4FA3D1] font-bold border border-[#252C30]"
                              : "text-[#7D878D] hover:text-white"
                          }`}
                        >
                          {filterKey.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {filteredAuditEvents.length === 0 ? (
                    <div className="py-12 text-center text-[#7D878D] font-sans">No matching audit logs found.</div>
                  ) : (
                    filteredAuditEvents.map((ev, i) => {
                      const dateStr = formatDateTimeString(ev.timestamp);
                      return (
                        <div
                          key={ev.id || i}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-[#090B0D] border border-[#252C30] rounded-md gap-3 text-xs"
                        >
                          <div className="flex items-center gap-3 truncate">
                            <span className="px-2 py-0.5 bg-[#14191C] border border-[#252C30] text-[#7D878D] text-[10px] font-bold">
                              {ev.actor.toUpperCase()}
                            </span>
                            <span className="font-semibold text-white">{ev.event_type}</span>
                            <span className="text-[#7D878D] truncate">{ev.detail}</span>
                          </div>

                          <span className="text-[#7D878D] text-[11px] shrink-0 font-mono">{dateStr}</span>
                        </div>
                      );
                    })
                  )}
                </div>

              </div>
            </div>
          )}

        </main>
      </div>

    </div>
  );
}

export default App;
