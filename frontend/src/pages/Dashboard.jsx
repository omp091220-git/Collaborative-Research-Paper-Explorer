import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import PaperUpload from '../components/PaperUpload';
import PaperList from '../components/PaperList';

export default function Dashboard() {
  const { user, logout, isAdmin, isResearcher, hasPermission } = useAuth();
  const navigate = useNavigate();

  const [testActionStatus, setTestActionStatus] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [paperRefresh, setPaperRefresh] = useState(0);

  const handlePaperAdded = () => setPaperRefresh((n) => n + 1);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const testBackendEndpoint = async (endpoint, method = 'get') => {
    setTestLoading(true);
    setTestActionStatus(null);
    try {
      const res = await axios({
        method,
        url: endpoint,
        withCredentials: true,
      });
      setTestActionStatus({
        success: true,
        message: res.data?.message || 'Access granted by server.',
        status: res.status,
      });
    } catch (err) {
      setTestActionStatus({
        success: false,
        message:
          err.response?.data?.error ||
          err.response?.data?.message ||
          'Access forbidden by server.',
        status: err.response?.status || 500,
        code: err.response?.data?.code,
      });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">📄</span>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
                  Welcome, {user?.full_name}!
                </h1>
              </div>
              <p className="text-slate-500 text-sm mt-1">
                Collaborative Research Paper Explorer
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                ✓ Authenticated
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                ⏱ 30m Inactivity Window
              </span>
              <button
                onClick={handleLogout}
                className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold shadow-xs transition duration-200 cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* User Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Account Details
              </p>
              <p className="text-sm text-slate-700">
                <strong className="text-slate-900">Email:</strong> {user?.email}
              </p>
              <p className="text-sm text-slate-700 flex items-center gap-2">
                <strong className="text-slate-900">Role:</strong>
                <span
                  className={`inline-block px-2.5 py-0.5 font-semibold rounded text-xs ${
                    isAdmin
                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                      : isResearcher
                      ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {user?.role}
                </span>
                <span className="text-xs text-slate-400 italic">
                  (Cannot be self-assigned)
                </span>
              </p>
              {user?.affiliation && (
                <p className="text-sm text-slate-700">
                  <strong className="text-slate-900">Affiliation:</strong>{' '}
                  {user.affiliation}
                </p>
              )}
            </div>

            <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Primary Research Interests
              </p>
              {user?.research_interests && user.research_interests.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {user.research_interests.map((interest) => (
                    <span
                      key={interest}
                      className="px-2.5 py-1 bg-white border border-indigo-200 text-indigo-700 rounded-md text-xs font-medium shadow-xs"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  No research interests specified.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* FR-05: Role-Based Access Control Actions Matrix */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <span>🛡️</span> Role-Based Functionality (FR-05)
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Actions are conditionally accessible based on your assigned role (
              <strong>{user?.role}</strong>). All actions are strictly verified by backend authorization middleware.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Action 1: Browse Papers */}
            <div className="p-4 border rounded-xl bg-emerald-50/40 border-emerald-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                  <span>📖</span> Browse Research Papers
                </span>
                <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 font-medium rounded-full">
                  All Roles
                </span>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                Search, filter, and read academic papers stored in the system.
              </p>
              <span className="text-xs font-semibold text-emerald-700">
                ✓ Permitted for {user?.role}
              </span>
            </div>

            {/* Action 2: Generate AI Summaries */}
            <div className="p-4 border rounded-xl bg-emerald-50/40 border-emerald-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                  <span>🤖</span> AI Paper Summaries
                </span>
                <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 font-medium rounded-full">
                  All Roles
                </span>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                Generate Background, Methodology, Results, and Limitations summaries with supporting PDF page and coordinate references.
              </p>
              <span className="text-xs font-semibold text-emerald-700">
                ✓ Permitted for {user?.role}
              </span>
            </div>

            {/* Action 3: Upload Research Papers */}
            <div
              className={`p-4 border rounded-xl ${
                hasPermission('papers:upload')
                  ? 'bg-indigo-50/40 border-indigo-200'
                  : 'bg-slate-50 border-slate-200 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                  <span>📤</span> Upload Research Papers
                </span>
                <span
                  className={`text-xs px-2 py-0.5 font-medium rounded-full ${
                    hasPermission('papers:upload')
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {hasPermission('papers:upload') ? 'Available' : 'Restricted'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                Submit and index newly published papers or arXiv manuscripts.
              </p>
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-semibold ${
                    hasPermission('papers:upload')
                      ? 'text-indigo-700'
                      : 'text-slate-500'
                  }`}
                >
                  {hasPermission('papers:upload')
                    ? '✓ Permitted for ' + user?.role
                    : '✗ Requires RESEARCHER or SYSTEM_ADMIN role'}
                </span>
                <button
                  type="button"
                  disabled={testLoading}
                  onClick={() =>
                    testBackendEndpoint(
                      '/api/auth/papers/check-upload-permission',
                      'post'
                    )
                  }
                  className="px-2.5 py-1 text-xs bg-white border border-slate-300 hover:bg-slate-50 rounded font-medium text-slate-700 shadow-2xs transition cursor-pointer"
                >
                  Verify Backend Permission
                </button>
              </div>
            </div>

            {/* Action 4: User & Role Administration */}
            <div
              className={`p-4 border rounded-xl ${
                isAdmin
                  ? 'bg-purple-50/40 border-purple-200'
                  : 'bg-slate-50 border-slate-200 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                  <span>⚙️</span> Administer Roles & Users
                </span>
                <span
                  className={`text-xs px-2 py-0.5 font-medium rounded-full ${
                    isAdmin
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {isAdmin ? 'System Admin Only' : 'Restricted'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                Manage user access, review audit logs, and assign privileged roles.
              </p>
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-semibold ${
                    isAdmin ? 'text-purple-700' : 'text-slate-500'
                  }`}
                >
                  {isAdmin
                    ? '✓ Permitted (SYSTEM_ADMIN)'
                    : '✗ Forbidden for ' + user?.role}
                </span>
                <button
                  type="button"
                  disabled={testLoading}
                  onClick={() => testBackendEndpoint('/api/auth/admin-only', 'get')}
                  className="px-2.5 py-1 text-xs bg-white border border-slate-300 hover:bg-slate-50 rounded font-medium text-slate-700 shadow-2xs transition cursor-pointer"
                >
                  Verify Backend Admin Route
                </button>
              </div>
            </div>
          </div>

          {/* Backend Verification Result Toast */}
          {testActionStatus && (
            <div
              className={`mt-4 p-3 rounded-lg text-xs font-medium border flex items-center justify-between ${
                testActionStatus.success
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              <div>
                <strong>Server Response ({testActionStatus.status}):</strong>{' '}
                {testActionStatus.message}
              </div>
              <button
                onClick={() => setTestActionStatus(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-700 ml-4 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Research Paper Upload & Import (only for authorized roles) */}
        {hasPermission('papers:upload') && (
          <PaperUpload onPaperAdded={handlePaperAdded} />
        )}

        {/* Research Paper Listing */}
        <PaperList refreshTrigger={paperRefresh} />
      </div>
    </div>
  );
}
