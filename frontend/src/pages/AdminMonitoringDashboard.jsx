import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function AdminMonitoringDashboard() {
  const { isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  // Navigation tabs
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'storage', 'redis', 'genai'
  const [period, setPeriod] = useState('30d'); // 'today', '7d', '30d', 'all'
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(30); // seconds (0 = off)

  // Data states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [overviewData, setOverviewData] = useState(null);
  const [storageData, setStorageData] = useState(null);
  const [redisData, setRedisData] = useState(null);
  const [genaiData, setGenaiData] = useState(null);

  // Test usage modal state
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [recordForm, setRecordForm] = useState({
    modelName: 'gemini-1.5-flash',
    promptTokens: 1250,
    completionTokens: 420,
    isEstimated: false,
    operationType: 'summary',
  });
  const [recordSubmitting, setRecordSubmitting] = useState(false);
  const [recordSuccessMsg, setRecordSuccessMsg] = useState(null);

  // Request race-condition guard
  const requestSeqRef = useRef(0);

  // Fetch all monitoring data
  const fetchDashboardData = useCallback(async (isBackground = false) => {
    const currentSeq = ++requestSeqRef.current;
    if (!isBackground) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const [overviewRes, storageRes, redisRes, genaiRes] = await Promise.all([
        axios.get('/api/admin/monitoring/overview', { withCredentials: true }),
        axios.get('/api/admin/monitoring/storage', { withCredentials: true }),
        axios.get('/api/admin/monitoring/redis', { withCredentials: true }),
        axios.get(`/api/admin/monitoring/genai?period=${period}`, { withCredentials: true }),
      ]);

      if (currentSeq === requestSeqRef.current) {
        setOverviewData(overviewRes.data?.overview || null);
        setStorageData(storageRes.data || null);
        setRedisData(redisRes.data || null);
        setGenaiData(genaiRes.data || null);
        setLastUpdated(new Date());
      }
    } catch (err) {
      if (currentSeq === requestSeqRef.current) {
        if (err.response?.status === 403) {
          setError('Access denied. You must have the SYSTEM_ADMIN role to view this dashboard.');
        } else {
          setError(
            err.response?.data?.error ||
            err.response?.data?.message ||
            'Failed to load monitoring metrics from backend.'
          );
        }
      }
    } finally {
      if (currentSeq === requestSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [period]);

  // Initial load & period change
  useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) {
        fetchDashboardData(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [fetchDashboardData]);

  // Polling timer with cleanup
  useEffect(() => {
    if (!autoRefreshInterval || autoRefreshInterval <= 0) return;

    const intervalId = setInterval(() => {
      fetchDashboardData(true);
    }, autoRefreshInterval * 1000);

    return () => clearInterval(intervalId);
  }, [autoRefreshInterval, fetchDashboardData]);

  // Submit test GenAI record
  const handleRecordSubmit = async (e) => {
    e.preventDefault();
    setRecordSubmitting(true);
    setRecordSuccessMsg(null);

    try {
      await axios.post(
        '/api/admin/monitoring/genai/record',
        {
          modelName: recordForm.modelName,
          promptTokens: Number(recordForm.promptTokens),
          completionTokens: Number(recordForm.completionTokens),
          isEstimated: recordForm.isEstimated,
          operationType: recordForm.operationType,
        },
        { withCredentials: true }
      );

      setRecordSuccessMsg('Token usage successfully recorded!');
      setTimeout(() => {
        setShowRecordModal(false);
        setRecordSuccessMsg(null);
        fetchDashboardData(true);
      }, 1200);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to record usage');
    } finally {
      setRecordSubmitting(false);
    }
  };

  // Guard: if user is not admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-red-200 max-w-md w-full text-center">
          <div className="text-4xl mb-3">⛔</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Access Restricted</h2>
          <p className="text-slate-600 text-sm mb-6">
            The System-Administrator Monitoring Dashboard is restricted to users with the{' '}
            <strong className="text-purple-700">SYSTEM_ADMIN</strong> role.
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              to="/dashboard"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition"
            >
              Return to User Dashboard
            </Link>
            <button
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ─── Top Navigation Header ────────────────────────────────────────────── */}
        <header className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-2xl">📊</span>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
                  System-Administrator Monitoring Dashboard
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                  SYSTEM_ADMIN
                </span>
              </div>
              <p className="text-slate-500 text-sm mt-1">
                Real-time infrastructure health, storage utilization, job queues, and GenAI token analytics.
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Back to User Dashboard */}
              <Link
                to="/dashboard"
                className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-2xs transition flex items-center gap-1.5"
              >
                <span>←</span> User Dashboard
              </Link>

              {/* Auto Refresh dropdown */}
              <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                <span>⏱ Auto-refresh:</span>
                <select
                  value={autoRefreshInterval}
                  onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                  className="bg-transparent font-medium text-slate-800 focus:outline-hidden cursor-pointer"
                >
                  <option value={0}>Off (Manual)</option>
                  <option value={10}>Every 10s</option>
                  <option value={30}>Every 30s</option>
                  <option value={60}>Every 60s</option>
                </select>
              </div>

              {/* Refresh button */}
              <button
                onClick={() => fetchDashboardData(true)}
                disabled={refreshing || loading}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <span className={`${refreshing ? 'animate-spin' : ''}`}>🔄</span>
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Sub-bar with status and timestamps */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Backend Connected: <strong>http://localhost:5000</strong></span>
            </div>
            {lastUpdated && (
              <div>
                Last synced at: <strong className="text-slate-700">{lastUpdated.toLocaleTimeString()}</strong>
              </div>
            )}
          </div>
        </header>

        {/* ─── Error Alert ──────────────────────────────────────────────────────── */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
            <button
              onClick={() => fetchDashboardData(false)}
              className="text-xs font-semibold underline hover:text-red-900 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* ─── A. OVERVIEW SUMMARY CARDS ────────────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Card 1: Storage Quota & Usage */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>💾</span> Storage Usage
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    overviewData?.storage?.status === 'CRITICAL'
                      ? 'bg-red-100 text-red-800'
                      : overviewData?.storage?.status === 'WARNING'
                      ? 'bg-amber-100 text-amber-800'
                      : overviewData?.storage?.quotaConfigured
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {overviewData?.storage?.status || 'HEALTHY'}
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {overviewData?.storage?.totalUsedFormatted || '0 B'}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {overviewData?.storage?.quotaConfigured
                  ? `Quota: ${overviewData.storage.quotaFormatted}`
                  : 'No Quota Configured (Host Limited)'}
              </p>
            </div>

            <div className="mt-4">
              {overviewData?.storage?.quotaConfigured ? (
                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                    <span>Utilization</span>
                    <span>{overviewData.storage.utilizationPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        overviewData.storage.isCritical
                          ? 'bg-red-500'
                          : overviewData.storage.isWarning
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, overviewData.storage.utilizationPercent || 0)}%` }}
                    ></div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">
                  {overviewData?.storage?.paperCount || 0} stored research papers
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Redis Queues & Jobs */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>⚡</span> Redis Queues
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    overviewData?.redis?.status === 'CONNECTED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : overviewData?.redis?.status === 'UNAVAILABLE'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {overviewData?.redis?.status === 'CONNECTED'
                    ? '● Connected'
                    : overviewData?.redis?.status === 'UNAVAILABLE'
                    ? '✕ Offline'
                    : 'Not Configured'}
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {overviewData?.redis?.totalQueues || 0} Queues
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {overviewData?.redis?.connected
                  ? `${overviewData.redis.pendingJobs || 0} pending jobs`
                  : overviewData?.redis?.configured
                  ? 'Redis service unreachable'
                  : 'Queue infrastructure inactive'}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">Failed Jobs:</span>
              <span
                className={`font-semibold ${
                  (overviewData?.redis?.failedJobs || 0) > 0 ? 'text-red-600' : 'text-slate-700'
                }`}
              >
                {overviewData?.redis?.failedJobs || 0}
              </span>
            </div>
          </div>

          {/* Card 3: Total GenAI Tokens */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>🧠</span> GenAI Tokens
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                  {overviewData?.genai?.period?.toUpperCase() || '30D'}
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {(overviewData?.genai?.totalTokens || 0).toLocaleString()}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Total API tokens consumed
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 text-xs">
              <div>
                <span className="text-slate-400">Input: </span>
                <strong className="text-slate-700 font-semibold">
                  {(overviewData?.genai?.promptTokens || 0).toLocaleString()}
                </strong>
              </div>
              <div>
                <span className="text-slate-400">Output: </span>
                <strong className="text-slate-700 font-semibold">
                  {(overviewData?.genai?.completionTokens || 0).toLocaleString()}
                </strong>
              </div>
            </div>
          </div>

          {/* Card 4: Estimated GenAI API Cost */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>💵</span> Estimated API Cost
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                  USD
                </span>
              </div>
              <div className="text-2xl font-bold text-emerald-700">
                ${Number(overviewData?.genai?.totalCostUsd || 0).toFixed(4)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Based on actual provider token pricing
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">Successful Calls:</span>
              <strong className="text-slate-800 font-semibold">
                {overviewData?.genai?.totalRequests || 0} requests
              </strong>
            </div>
          </div>

        </section>

        {/* ─── Navigation Tabs & Controls ───────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: '📊 All Monitors' },
              { id: 'storage', label: '💾 Storage Quota' },
              { id: 'redis', label: '⚡ Redis Queues' },
              { id: 'genai', label: '🧠 GenAI Consumption & Costs' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* GenAI Time Period Filter */}
          {(activeTab === 'all' || activeTab === 'genai') && (
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 text-xs self-start sm:self-auto">
              <span className="px-2 font-medium text-slate-400">Period:</span>
              {[
                { id: 'today', label: 'Today' },
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: 'all', label: 'All Time' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    period === p.id
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── B. STORAGE QUOTA MONITORING SECTION ──────────────────────────────── */}
        {(activeTab === 'all' || activeTab === 'storage') && (
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>💾</span> Storage Quota & Capacity Monitoring
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Measurements derived from the PostgreSQL metadata and physical uploads filesystem.
                </p>
              </div>
              <div className="text-xs font-semibold text-slate-500">
                Thresholds: Warning at {storageData?.quota?.warningThresholdPercent || 80}%, Critical at {storageData?.quota?.criticalThresholdPercent || 90}%
              </div>
            </div>

            {/* Storage Progress & Breakdown Bar */}
            <div className="p-5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-2">
                <div>
                  <span className="font-semibold text-slate-800">Used Storage: </span>
                  <strong className="text-slate-900 text-base">
                    {storageData?.usage?.totalFormatted || '0 B'}
                  </strong>
                  {storageData?.quota?.configured ? (
                    <span className="text-slate-500 text-xs ml-1">
                      of {storageData.quota.quotaFormatted} ({storageData.usage.utilizationPercent}% utilized)
                    </span>
                  ) : (
                    <span className="text-slate-500 text-xs ml-1">
                      (No quota configured — unlimited host disk)
                    </span>
                  )}
                </div>

                {storageData?.quota?.configured && (
                  <div className="text-xs text-slate-600 font-medium">
                    Remaining Capacity:{' '}
                    <strong className="text-emerald-700 font-bold">
                      {storageData.usage.remainingFormatted}
                    </strong>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              {storageData?.quota?.configured ? (
                <div className="w-full bg-slate-200 rounded-full h-3.5 overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      storageData.usage.isCritical
                        ? 'bg-red-500'
                        : storageData.usage.isWarning
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, storageData.usage.utilizationPercent || 0)}%` }}
                  ></div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50/80 border border-amber-200 text-amber-800 rounded-lg text-xs leading-relaxed">
                  ℹ️ <strong>No Storage Quota Configured:</strong> Set <code>STORAGE_QUOTA_MB=1024</code> in your backend <code>.env</code> file to enforce capacity limits and warning alerts.
                </div>
              )}

              {/* Warning alert if threshold exceeded */}
              {storageData?.usage?.isCritical && (
                <div className="p-3 bg-red-100 border border-red-300 text-red-900 rounded-lg text-xs font-semibold flex items-center gap-2">
                  <span>🚨</span>
                  <span>CRITICAL STORAGE WARNING: Utilization has exceeded {storageData?.quota?.criticalThresholdPercent}%. Immediate cleanup or quota expansion required.</span>
                </div>
              )}
              {storageData?.usage?.isWarning && (
                <div className="p-3 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg text-xs font-semibold flex items-center gap-2">
                  <span>⚠️</span>
                  <span>STORAGE WARNING: Utilization has exceeded {storageData?.quota?.warningThresholdPercent}%. Approaching storage capacity.</span>
                </div>
              )}
            </div>

            {/* Storage Comparison Grid: DB Metadata vs Physical Disk */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-1">
                <span className="text-xs text-slate-400 font-semibold uppercase">Total Stored Papers</span>
                <div className="text-xl font-bold text-slate-800">
                  {storageData?.usage?.paperCount || 0}
                </div>
                <p className="text-xs text-slate-500">
                  Average paper size: {storageData?.usage?.avgFileSizeFormatted || '0 B'}
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-1">
                <span className="text-xs text-slate-400 font-semibold uppercase">Physical Disk (uploads/)</span>
                <div className="text-xl font-bold text-slate-800">
                  {storageData?.diskInspection?.formattedBytes || '0 B'}
                </div>
                <p className="text-xs text-slate-500">
                  {storageData?.diskInspection?.fileCount || 0} verified PDF files on host filesystem
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-1">
                <span className="text-xs text-slate-400 font-semibold uppercase">Single Max File Size</span>
                <div className="text-xl font-bold text-slate-800">
                  {storageData?.usage?.maxFileSizeFormatted || '0 B'}
                </div>
                <p className="text-xs text-slate-500">
                  Enforced upload ceiling: 30 MiB
                </p>
              </div>
            </div>

            {/* Top Uploaders Table */}
            {storageData?.topUploaders && storageData.topUploaders.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-2">
                  Top Storage Consumers (Uploaders)
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-3">Researcher</th>
                        <th className="p-3">Email</th>
                        <th className="p-3 text-center">Papers Uploaded</th>
                        <th className="p-3 text-right">Total Storage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {storageData.topUploaders.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-medium text-slate-900">{u.fullName}</td>
                          <td className="p-3 text-slate-600">{u.email}</td>
                          <td className="p-3 text-center">{u.paperCount}</td>
                          <td className="p-3 text-right font-semibold text-indigo-700">
                            {u.formattedBytes}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Stored Papers Inventory Breakdown */}
            {storageData?.recentPapers && storageData.recentPapers.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-2">
                  Stored Research Papers Inventory (Recent)
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-3">Title</th>
                        <th className="p-3">arXiv ID</th>
                        <th className="p-3">Uploader</th>
                        <th className="p-3">Uploaded</th>
                        <th className="p-3 text-right">Size</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {storageData.recentPapers.slice(0, 10).map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-medium text-slate-900 max-w-xs truncate" title={p.title}>
                            {p.title}
                          </td>
                          <td className="p-3 text-slate-600">
                            {p.arxivId ? (
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-mono">
                                {p.arxivId}
                              </span>
                            ) : (
                              <span className="text-slate-400">Direct upload</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-600">{p.uploaderName}</td>
                          <td className="p-3 text-slate-500">
                            {new Date(p.uploadedAt).toLocaleDateString()}
                          </td>
                          <td className="p-3 text-right font-semibold text-slate-800">
                            {p.fileSizeFormatted}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ─── C. REDIS QUEUE MONITORING SECTION ────────────────────────────────── */}
        {(activeTab === 'all' || activeTab === 'redis') && (
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>⚡</span> Redis Queues & Asynchronous Processing
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Read-only queue telemetry, connection health, and worker queue execution states.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    redisData?.status === 'CONNECTED'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : redisData?.status === 'UNAVAILABLE'
                      ? 'bg-red-50 text-red-800 border-red-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  Status: {redisData?.status || 'NOT_CONFIGURED'}
                </span>
              </div>
            </div>

            {/* Condition 1: Redis is Connected */}
            {redisData?.connected && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200">
                    <span className="text-xs text-emerald-700 font-semibold uppercase">Redis Version</span>
                    <div className="text-xl font-bold text-slate-900 mt-1">
                      v{redisData.connection?.version || 'N/A'}
                    </div>
                  </div>
                  <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200">
                    <span className="text-xs text-emerald-700 font-semibold uppercase">Memory Used</span>
                    <div className="text-xl font-bold text-slate-900 mt-1">
                      {redisData.connection?.memoryUsed || 'N/A'}
                    </div>
                  </div>
                  <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200">
                    <span className="text-xs text-emerald-700 font-semibold uppercase">Uptime</span>
                    <div className="text-xl font-bold text-slate-900 mt-1">
                      {redisData.connection?.uptimeDays || 'N/A'}
                    </div>
                  </div>
                  <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200">
                    <span className="text-xs text-emerald-700 font-semibold uppercase">Clients</span>
                    <div className="text-xl font-bold text-slate-900 mt-1">
                      {redisData.connection?.connectedClients || 1}
                    </div>
                  </div>
                </div>

                {/* Queue list table */}
                {redisData.queues && redisData.queues.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="p-3">Queue Name</th>
                          <th className="p-3 text-center">Pending</th>
                          <th className="p-3 text-center">Processing</th>
                          <th className="p-3 text-center">Completed</th>
                          <th className="p-3 text-center">Failed</th>
                          <th className="p-3 text-right">Total Length</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {redisData.queues.map((q) => (
                          <tr key={q.name} className="hover:bg-slate-50/50">
                            <td className="p-3 font-semibold text-slate-900">{q.name}</td>
                            <td className="p-3 text-center text-amber-700 font-semibold">{q.pending}</td>
                            <td className="p-3 text-center text-indigo-700 font-semibold">{q.processing}</td>
                            <td className="p-3 text-center text-emerald-700 font-semibold">{q.completed}</td>
                            <td className="p-3 text-center text-red-700 font-semibold">{q.failed}</td>
                            <td className="p-3 text-right font-bold text-slate-900">{q.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                    No active queues found on the connected Redis instance. Queues will automatically appear here once workers register.
                  </div>
                )}
              </div>
            )}

            {/* Condition 2: Redis is Configured but Offline/Unavailable */}
            {redisData?.configured && !redisData.connected && (
              <div className="p-5 bg-red-50 border border-red-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-red-900 font-bold text-sm">
                  <span>🚨</span> Redis Server Connection Failed
                </div>
                <p className="text-xs text-red-700 leading-relaxed">
                  The backend attempted a read-only probe to{' '}
                  <code className="bg-red-100 px-1 py-0.5 rounded font-mono">{redisData.connection?.targetUrl || 'REDIS_URL'}</code>,
                  but the connection could not be established: <strong>{redisData.error}</strong>.
                </p>
                <p className="text-xs text-slate-600">
                  Ensure the Redis daemon is running on the host or that your firewall and network credentials allow outbound connection to the specified port.
                </p>
              </div>
            )}

            {/* Condition 3: Redis is honestly NOT configured */}
            {!redisData?.configured && (
              <div className="space-y-4">
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
                    <span>ℹ️</span> Redis & Queue Processing Is Not Configured
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    The Collaborative Research Paper Explorer currently runs without a Redis queue dependency. Background workers for OCR, full-text indexing, and asynchronous AI summarization are currently offline.
                  </p>
                </div>

                {/* Integration Guide Card */}
                {redisData?.integrationGuide && (
                  <div className="bg-white rounded-xl border border-indigo-100 p-5 shadow-2xs space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-600">🛠️</span>
                      <h3 className="text-sm font-bold text-slate-900">
                        {redisData.integrationGuide.title}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-600">
                      {redisData.integrationGuide.description}
                    </p>

                    <div className="space-y-3">
                      {redisData.integrationGuide.steps.map((st) => (
                        <div key={st.step} className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs space-y-1.5">
                          <div className="font-semibold text-slate-800">
                            Step {st.step}: {st.title}
                          </div>
                          {st.command && (
                            <pre className="p-2 bg-slate-900 text-slate-100 rounded text-2xs font-mono overflow-x-auto">
                              {st.command}
                            </pre>
                          )}
                          {st.example && (
                            <pre className="p-2 bg-slate-900 text-slate-100 rounded text-2xs font-mono overflow-x-auto">
                              {st.example}
                            </pre>
                          )}
                          <p className="text-slate-500 text-2xs">{st.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ─── D. GENAI API TOKEN CONSUMPTION & COSTS SECTION ───────────────────── */}
        {(activeTab === 'all' || activeTab === 'genai') && (
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>🧠</span> GenAI API Token Consumption & Cost Analytics
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Calculated using actual provider pricing rates. Distinguishes provider-reported token metrics from estimates.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setShowRecordModal(true)}
                  className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold shadow-2xs transition flex items-center gap-1 cursor-pointer"
                >
                  <span>➕</span> Record Test Token Usage
                </button>
              </div>
            </div>

            {/* Token Metrics Quick Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-xs text-slate-400 font-semibold uppercase">Total Consumed</span>
                <div className="text-xl font-bold text-slate-900">
                  {(genaiData?.summary?.totalTokens || 0).toLocaleString()}
                </div>
                <p className="text-xs text-slate-500">Tokens ({genaiData?.period})</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-xs text-slate-400 font-semibold uppercase">Prompt (Input) Tokens</span>
                <div className="text-xl font-bold text-indigo-700">
                  {(genaiData?.summary?.promptTokens || 0).toLocaleString()}
                </div>
                <p className="text-xs text-slate-500">Sent to models</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-xs text-slate-400 font-semibold uppercase">Completion (Output)</span>
                <div className="text-xl font-bold text-emerald-700">
                  {(genaiData?.summary?.completionTokens || 0).toLocaleString()}
                </div>
                <p className="text-xs text-slate-500">Generated summaries</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-xs text-slate-400 font-semibold uppercase">Estimated Cost (USD)</span>
                <div className="text-xl font-bold text-emerald-700">
                  ${Number(genaiData?.summary?.totalCostUsd || 0).toFixed(4)}
                </div>
                <p className="text-xs text-slate-500">
                  Across {genaiData?.summary?.totalRequests || 0} API calls
                </p>
              </div>
            </div>

            {/* Token Reporting Accuracy Badge */}
            <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-indigo-900 gap-2">
              <div className="flex items-center gap-2">
                <span>🛡️</span>
                <span>
                  <strong>Telemetry Accuracy:</strong> {genaiData?.summary?.actualReportedCount || 0} calls reported directly by provider API usage metadata; {genaiData?.summary?.estimatedCount || 0} calls estimated via tokenization fallback.
                </span>
              </div>
              <span className="text-2xs font-semibold px-2 py-0.5 bg-indigo-100 rounded-full self-start sm:self-auto">
                No Fabricated Values
              </span>
            </div>

            {/* Model-Wise Breakdown */}
            {genaiData?.byModel && genaiData.byModel.length > 0 ? (
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-2">
                  Model-Wise Token & Cost Breakdown
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-3">Model</th>
                        <th className="p-3">Provider</th>
                        <th className="p-3 text-center">Requests</th>
                        <th className="p-3 text-right">Input Tokens</th>
                        <th className="p-3 text-right">Output Tokens</th>
                        <th className="p-3 text-right">Total Tokens</th>
                        <th className="p-3 text-right">Estimated Cost (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {genaiData.byModel.map((m) => (
                        <tr key={m.modelName} className="hover:bg-slate-50/50">
                          <td className="p-3 font-semibold text-slate-900">{m.modelName}</td>
                          <td className="p-3 uppercase text-2xs font-bold text-slate-500">
                            {m.provider}
                          </td>
                          <td className="p-3 text-center">{m.requestCount}</td>
                          <td className="p-3 text-right text-indigo-700">
                            {m.promptTokens.toLocaleString()}
                          </td>
                          <td className="p-3 text-right text-emerald-700">
                            {m.completionTokens.toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-900">
                            {m.totalTokens.toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-bold text-emerald-700">
                            ${Number(m.totalCostUsd).toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                No GenAI API usage recorded for the selected period ({period}). Click &quot;Record Test Token Usage&quot; above to log an API request.
              </div>
            )}

            {/* Daily Usage Time-Series */}
            {genaiData?.timeSeries && genaiData.timeSeries.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-2">
                  Daily Token Consumption Trend
                </h3>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  {genaiData.timeSeries.map((day) => {
                    const maxTokens = Math.max(...genaiData.timeSeries.map((t) => t.totalTokens || 1));
                    const barWidth = Math.max(5, Math.round((day.totalTokens / maxTokens) * 100));

                    return (
                      <div key={day.date} className="flex items-center text-xs gap-3">
                        <span className="w-20 font-mono text-slate-500">{day.date}</span>
                        <div className="flex-1 bg-slate-200 rounded-full h-3 overflow-hidden">
                          <div
                            className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                            style={{ width: `${barWidth}%` }}
                          ></div>
                        </div>
                        <span className="w-24 text-right font-semibold text-slate-800">
                          {day.totalTokens.toLocaleString()} tok
                        </span>
                        <span className="w-20 text-right font-semibold text-emerald-700">
                          ${Number(day.costUsd).toFixed(4)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Usage Records Log */}
            {genaiData?.recentLogs && genaiData.recentLogs.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-2">
                  Recent Token Usage Telemetry Records
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-3">Timestamp</th>
                        <th className="p-3">Model</th>
                        <th className="p-3">Operation</th>
                        <th className="p-3 text-center">Prompt</th>
                        <th className="p-3 text-center">Completion</th>
                        <th className="p-3 text-center">Total</th>
                        <th className="p-3 text-center">Accuracy</th>
                        <th className="p-3 text-right">Cost (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {genaiData.recentLogs.slice(0, 10).map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50/50">
                          <td className="p-3 text-slate-500 font-mono text-2xs">
                            {new Date(l.created_at).toLocaleString()}
                          </td>
                          <td className="p-3 font-semibold text-slate-900">{l.model_name}</td>
                          <td className="p-3 text-slate-600">{l.operation_type}</td>
                          <td className="p-3 text-center text-slate-700">
                            {Number(l.prompt_tokens).toLocaleString()}
                          </td>
                          <td className="p-3 text-center text-slate-700">
                            {Number(l.completion_tokens).toLocaleString()}
                          </td>
                          <td className="p-3 text-center font-bold text-slate-900">
                            {Number(l.total_tokens).toLocaleString()}
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-2xs font-semibold ${
                                l.is_estimated
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {l.is_estimated ? 'Estimated' : 'Provider API'}
                            </span>
                          </td>
                          <td className="p-3 text-right font-bold text-emerald-700">
                            ${Number(l.estimated_cost_usd).toFixed(6)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

      </div>

      {/* ─── Record Test Token Usage Modal ──────────────────────────────────────── */}
      {showRecordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>➕</span> Record GenAI Token Usage
              </h3>
              <button
                onClick={() => setShowRecordModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Simulates or logs a successful GenAI call to verify live telemetry, PostgreSQL persistence, and pricing calculations.
            </p>

            {recordSuccessMsg ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-center text-xs font-semibold border border-emerald-200">
                ✓ {recordSuccessMsg}
              </div>
            ) : (
              <form onSubmit={handleRecordSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Model
                  </label>
                  <select
                    value={recordForm.modelName}
                    onChange={(e) => setRecordForm({ ...recordForm, modelName: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-indigo-500 font-medium"
                  >
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash ($0.075 / $0.30 per 1M)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro ($3.50 / $10.50 per 1M)</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash ($0.10 / $0.40 per 1M)</option>
                    <option value="gpt-4o">GPT-4o ($2.50 / $10.00 per 1M)</option>
                    <option value="gpt-4o-mini">GPT-4o mini ($0.15 / $0.60 per 1M)</option>
                    <option value="claude-3-5-sonnet">Claude 3.5 Sonnet ($3.00 / $15.00 per 1M)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      Prompt Tokens
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={recordForm.promptTokens}
                      onChange={(e) => setRecordForm({ ...recordForm, promptTokens: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      Completion Tokens
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={recordForm.completionTokens}
                      onChange={(e) => setRecordForm({ ...recordForm, completionTokens: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isEstimatedCheck"
                    checked={recordForm.isEstimated}
                    onChange={(e) => setRecordForm({ ...recordForm, isEstimated: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <label htmlFor="isEstimatedCheck" className="text-slate-600 font-medium">
                    Tokenizer estimated (not provider-reported)
                  </label>
                </div>

                <div className="flex gap-2 pt-3">
                  <button
                    type="submit"
                    disabled={recordSubmitting}
                    className="flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm transition disabled:bg-indigo-400 cursor-pointer"
                  >
                    {recordSubmitting ? 'Recording...' : 'Record Usage'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRecordModal(false)}
                    className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
