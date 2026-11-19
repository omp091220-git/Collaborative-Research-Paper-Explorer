import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  KeyRound,
  Check,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  User,
  Loader2,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import accessRequestsService from '../../services/accessRequests.service';
import PageHeader from '../../components/layout/PageHeader';
import Pagination from '../../components/common/Pagination';
import EmptyState from '../../components/common/EmptyState';
import { formatDate } from '../../utils/formatters';

export default function AccessRequestsPage() {
  const { isStudent } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(isStudent ? 'my' : 'received'); // 'received' | 'my'

  // Request list state
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  const [permissionFilter, setPermissionFilter] = useState('ALL'); // 'ALL' | 'VIEW' | 'ANNOTATE' | 'EDIT'
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Action states
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit: 15,
      };
      if (statusFilter !== 'ALL') {
        params.status = statusFilter;
      }
      if (permissionFilter !== 'ALL') {
        params.requestedPermission = permissionFilter;
      }

      let res;
      if (activeTab === 'received') {
        res = await accessRequestsService.getReceivedRequests(params);
      } else {
        res = await accessRequestsService.getMyRequests(params);
      }

      setRequests(res.requests || []);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          'Failed to load access requests. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [activeTab, statusFilter, permissionFilter, page]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (requestId) => {
    setActionLoadingId(requestId);
    setError(null);
    setSuccess(null);
    try {
      await accessRequestsService.approveRequest(requestId);
      setSuccess('Access request approved and collaborator permissions granted.');
      fetchRequests();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectingRequest) return;

    setActionLoadingId(rejectingRequest.id);
    setError(null);
    setSuccess(null);
    try {
      await accessRequestsService.rejectRequest(
        rejectingRequest.id,
        rejectionReason.trim() || undefined
      );
      setSuccess('Access request rejected.');
      setRejectingRequest(null);
      setRejectionReason('');
      fetchRequests();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reject request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelRequest = async (requestId) => {
    if (!window.confirm('Are you sure you want to cancel this pending access request?')) {
      return;
    }

    setActionLoadingId(requestId);
    setError(null);
    setSuccess(null);
    try {
      await accessRequestsService.cancelRequest(requestId);
      setSuccess('Access request cancelled.');
      fetchRequests();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            <span>PENDING</span>
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            <span>APPROVED</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" />
            <span>REJECTED</span>
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/15 text-slate-400 border border-slate-500/30">
            <Ban className="w-3 h-3" />
            <span>CANCELLED</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-theme-elevated text-theme-secondary border border-theme-subtle">
            {status}
          </span>
        );
    }
  };

  const getPermissionBadge = (perm) => {
    switch (perm) {
      case 'EDIT':
        return (
          <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
            EDIT
          </span>
        );
      case 'ANNOTATE':
        return (
          <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            ANNOTATE
          </span>
        );
      case 'VIEW':
        return (
          <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-theme-card text-theme-secondary border border-theme-subtle">
            VIEW
          </span>
        );
      default:
        return <span className="px-2 py-0.5 text-xs font-bold">{perm}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <PageHeader
        title={isStudent ? 'My Access Requests' : 'Access Requests'}
        subtitle={
          isStudent
            ? 'Track the status of your access requests for private research papers.'
            : 'Review collaboration requests received for your research papers, or monitor the status of requests you have submitted.'
        }
      />

      {/* Tabs (Hidden for students since they only have sent requests) */}
      {!isStudent && (
        <div className="flex border-b border-theme-subtle gap-6 text-sm font-bold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('received');
              setPage(1);
            }}
            className={`pb-3 border-b-2 transition cursor-pointer ${
              activeTab === 'received'
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-theme-muted hover:text-theme-secondary'
            }`}
          >
            Received Requests (For My Papers)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('my');
              setPage(1);
            }}
            className={`pb-3 border-b-2 transition cursor-pointer ${
              activeTab === 'my'
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-theme-muted hover:text-theme-secondary'
            }`}
          >
            My Sent Requests
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="p-4 bg-theme-card border border-theme-subtle rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-theme-secondary font-semibold mr-1">Status:</span>
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1 text-xs font-bold rounded-xl transition cursor-pointer ${
                statusFilter === st
                  ? 'bg-violet-600 text-white shadow-xs'
                  : 'bg-theme-elevated text-theme-muted hover:text-theme-main hover:bg-theme-subtle'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Permission Filter Dropdown (Hidden for students who can only request VIEW) */}
        {!isStudent && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-theme-secondary font-semibold">Permission:</span>
            <select
              value={permissionFilter}
              onChange={(e) => {
                setPermissionFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 text-xs bg-theme-elevated border border-theme-subtle rounded-xl text-theme-main font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/40 cursor-pointer"
            >
              <option value="ALL">All Permissions</option>
              <option value="VIEW">VIEW</option>
              <option value="ANNOTATE">ANNOTATE</option>
              <option value="EDIT">EDIT</option>
            </select>
          </div>
        )}
      </div>

      {/* Notification Banners */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-2xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchRequests}
            className="text-xs font-semibold underline hover:text-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-2xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Requests List */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-theme-muted">Loading access requests...</p>
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={
            activeTab === 'received'
              ? 'No access requests received'
              : 'You have not submitted any access requests'
          }
          description={
            activeTab === 'received'
              ? 'When researchers request VIEW, ANNOTATE, or EDIT access to your papers, their requests will appear here for your approval.'
              : isStudent
              ? "You haven't made any access requests yet. Browse papers in the explorer and request VIEW access to private research papers."
              : 'When you request permission on restricted private papers or ask for annotation rights on public research, they will appear here.'
          }
          actionLabel={isStudent ? 'Explore Papers' : undefined}
          onAction={isStudent ? () => navigate('/explore') : undefined}
        />
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div
              key={req.id}
              className="p-5 bg-theme-card border border-theme-subtle rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-violet-500/30 transition-all"
            >
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {getStatusBadge(req.status)}
                  <span className="text-xs text-theme-muted font-medium flex items-center gap-1">
                    Requested:
                  </span>
                  {getPermissionBadge(req.requested_permission)}

                  <span className="text-[11px] text-theme-muted flex items-center gap-1 ml-auto md:ml-2">
                    <Calendar className="w-3 h-3 text-theme-muted" />
                    <span>{formatDate(req.created_at, { shortMonth: true })}</span>
                  </span>
                </div>

                {/* Paper Title Link */}
                <Link
                  to={`/papers/${req.paper_id}`}
                  className="block text-sm font-bold text-theme-main hover:text-violet-400 transition"
                >
                  {req.paper_title || 'Research Paper'}
                </Link>

                {/* Person details */}
                <div className="flex items-center gap-3 text-xs text-theme-secondary flex-wrap">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-violet-400" />
                    <span>
                      {activeTab === 'received' ? 'Requester:' : 'Owner:'}{' '}
                      <strong className="text-theme-main">
                        {activeTab === 'received'
                          ? req.requester_name || req.requester_email
                          : req.owner_name || req.owner_email}
                      </strong>
                    </span>
                  </span>

                  {(activeTab === 'received' ? req.requester_email : req.owner_email) && (
                    <span className="text-[11px] text-theme-muted">
                      ({activeTab === 'received' ? req.requester_email : req.owner_email})
                    </span>
                  )}
                </div>

                {/* Request Reason */}
                {req.reason && (
                  <p className="text-xs text-theme-muted bg-theme-elevated p-2.5 rounded-xl border border-theme-subtle italic">
                    "{req.reason}"
                  </p>
                )}

                {/* Rejection Reason if Rejected */}
                {req.status === 'REJECTED' && req.rejection_reason && (
                  <div className="text-xs text-rose-300 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/30">
                    <strong>Rejection Reason:</strong> {req.rejection_reason}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                {activeTab === 'received' && req.status === 'PENDING' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setRejectingRequest(req)}
                      disabled={actionLoadingId === req.id}
                      className="px-3.5 py-1.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition cursor-pointer"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(req.id)}
                      disabled={actionLoadingId === req.id}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                    >
                      {actionLoadingId === req.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Approve Access</span>
                    </button>
                  </>
                )}

                {activeTab === 'my' && req.status === 'PENDING' && (
                  <button
                    type="button"
                    onClick={() => handleCancelRequest(req.id)}
                    disabled={actionLoadingId === req.id}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-theme-subtle text-theme-secondary hover:text-rose-400 hover:bg-theme-elevated text-xs font-semibold transition cursor-pointer"
                  >
                    {actionLoadingId === req.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Ban className="w-3.5 h-3.5" />
                    )}
                    <span>Cancel Request</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pt-4 flex justify-center">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(p) => setPage(p)}
          />
        </div>
      )}

      {/* Rejection Reason Modal */}
      {rejectingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-theme-card rounded-2xl shadow-2xl border border-theme-subtle w-full max-w-md p-6">
            <h3 className="text-base font-bold text-theme-main">
              Reject Access Request
            </h3>
            <p className="text-xs text-theme-muted mt-2">
              Rejecting {rejectingRequest.requester_name || 'researcher'}'s request for{' '}
              <strong className="text-violet-400">
                {rejectingRequest.requested_permission}
              </strong>{' '}
              access to "{rejectingRequest.paper_title}".
            </p>

            <form onSubmit={handleRejectSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-theme-secondary mb-1">
                  Rejection Reason (Optional)
                </label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this request is being declined (e.g. project is confidential, or permission is restricted to core lab researchers)..."
                  maxLength={500}
                  className="w-full px-3 py-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/40 text-theme-main placeholder:text-theme-muted resize-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectingRequest(null);
                    setRejectionReason('');
                  }}
                  disabled={Boolean(actionLoadingId)}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-theme-elevated hover:bg-theme-subtle text-theme-secondary transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(actionLoadingId)}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition shadow-sm cursor-pointer"
                >
                  {actionLoadingId ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
