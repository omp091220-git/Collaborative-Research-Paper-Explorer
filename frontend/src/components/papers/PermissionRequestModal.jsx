import { useState, useEffect } from 'react';
import { KeyRound, Shield, AlertCircle, CheckCircle2, Loader2, X, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import accessRequestsService from '../../services/accessRequests.service';

export default function PermissionRequestModal({
  paper,
  isOpen,
  onClose,
  defaultPermission = 'ANNOTATE',
  eligiblePermissions = ['VIEW', 'ANNOTATE', 'EDIT'],
  pendingRequest = null,
  onSuccess,
}) {
  const { user } = useAuth();

  // Determine initial selection based on eligible permissions and default
  const validEligible =
    eligiblePermissions && eligiblePermissions.length > 0
      ? eligiblePermissions
      : ['ANNOTATE'];

  const initialPerm = validEligible.includes(defaultPermission)
    ? defaultPermission
    : validEligible[0];

  const [requestedPermission, setRequestedPermission] = useState(initialPerm);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const init = validEligible.includes(defaultPermission)
        ? defaultPermission
        : validEligible[0];
      setRequestedPermission(init);
      setError(null);
      setSubmitted(false);
      setReason('');
    }
  }, [isOpen, defaultPermission, validEligible]);

  if (!isOpen || !paper) return null;

  const isStudent = user?.role === 'STUDENT';
  const hasActivePending = Boolean(pendingRequest && pendingRequest.status === 'PENDING');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (hasActivePending) {
      setError(`You already have an active pending request for ${pendingRequest.requested_permission} access.`);
      return;
    }

    if (isStudent && (requestedPermission === 'ANNOTATE' || requestedPermission === 'EDIT')) {
      setError('Student accounts are read-only and cannot request annotation or editing permissions.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await accessRequestsService.createRequest({
        paperId: paper.id,
        requestedPermission,
        reason: reason.trim() || undefined,
      });
      setSubmitted(true);
      if (onSuccess) {
        onSuccess(requestedPermission);
      }
    } catch (err) {
      const errMsg =
        err.response?.data?.error ||
        'Failed to submit access request. Please try again.';
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setSubmitted(false);
    setReason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-theme-card rounded-2xl shadow-2xl border border-theme-subtle w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-theme-subtle flex items-start justify-between gap-4 bg-theme-elevated">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-500/20 text-violet-400 rounded-xl shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-theme-main">
                Request Paper Access
              </h2>
              <p className="text-xs text-theme-muted line-clamp-1" title={paper.title}>
                {paper.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-theme-muted hover:text-theme-main p-1 rounded-lg hover:bg-theme-card transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {hasActivePending && !submitted && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-4 text-xs text-amber-300 flex items-start gap-2.5">
              <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <p className="font-bold text-amber-400">Request Currently Pending</p>
                <p className="text-[11px] mt-0.5 text-theme-secondary">
                  You already submitted a request for{' '}
                  <strong className="text-amber-300">{pendingRequest.requested_permission}</strong> access.
                  The paper owner has been notified and your request is awaiting review.
                </p>
              </div>
            </div>
          )}

          {submitted ? (
            <div className="py-6 text-center space-y-3">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-theme-main">
                Request Submitted Successfully
              </h3>
              <p className="text-xs text-theme-muted max-w-sm mx-auto leading-relaxed">
                Your request for <strong className="text-violet-400">{requestedPermission}</strong> permission
                has been delivered to the paper owner ({paper.owner_name || 'Owner'}).
                You will receive a notification once reviewed.
              </p>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-theme-elevated hover:bg-theme-subtle text-theme-main transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Target paper details overview */}
              <div className="p-3 bg-theme-elevated rounded-xl border border-theme-subtle text-xs space-y-1">
                <div className="flex justify-between text-theme-secondary">
                  <span>Paper Owner:</span>
                  <span className="font-semibold text-theme-main">
                    {paper.owner_name || 'Dr. Shyam Ramani'}
                  </span>
                </div>
                <div className="flex justify-between text-theme-secondary">
                  <span>Paper Visibility:</span>
                  <span className="font-semibold text-theme-main">
                    {paper.visibility || 'PUBLIC'}
                  </span>
                </div>
              </div>

              {/* Eligible Permission Level Selector */}
              <div>
                <label className="block text-xs font-bold text-theme-secondary mb-2">
                  Select Permission Level
                </label>
                <div className={`grid gap-2 ${validEligible.length === 1 ? 'grid-cols-1' : validEligible.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {/* VIEW option */}
                  {validEligible.includes('VIEW') && (
                    <button
                      type="button"
                      disabled={hasActivePending}
                      onClick={() => setRequestedPermission('VIEW')}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        requestedPermission === 'VIEW'
                          ? 'bg-violet-500/15 border-violet-500 text-theme-main shadow-xs'
                          : 'bg-theme-elevated border-theme-subtle text-theme-muted hover:border-theme-subtle hover:text-theme-secondary'
                      } ${hasActivePending ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className="text-xs font-bold text-theme-main">VIEW</span>
                      <span className="text-[10px] text-theme-muted mt-1 leading-snug">
                        Read private paper & view annotations.
                      </span>
                    </button>
                  )}

                  {/* ANNOTATE option */}
                  {validEligible.includes('ANNOTATE') && (
                    <button
                      type="button"
                      disabled={isStudent || hasActivePending}
                      onClick={() => setRequestedPermission('ANNOTATE')}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        isStudent || hasActivePending
                          ? 'opacity-40 cursor-not-allowed bg-theme-elevated border-theme-subtle'
                          : requestedPermission === 'ANNOTATE'
                          ? 'bg-violet-500/15 border-violet-500 text-theme-main shadow-xs cursor-pointer'
                          : 'bg-theme-elevated border-theme-subtle text-theme-muted hover:border-theme-subtle hover:text-theme-secondary cursor-pointer'
                      }`}
                    >
                      <span className="text-xs font-bold text-theme-main">ANNOTATE</span>
                      <span className="text-[10px] text-theme-muted mt-1 leading-snug">
                        Add notes, highlights & discussions.
                      </span>
                    </button>
                  )}

                  {/* EDIT option */}
                  {validEligible.includes('EDIT') && (
                    <button
                      type="button"
                      disabled={isStudent || hasActivePending}
                      onClick={() => setRequestedPermission('EDIT')}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        isStudent || hasActivePending
                          ? 'opacity-40 cursor-not-allowed bg-theme-elevated border-theme-subtle'
                          : requestedPermission === 'EDIT'
                          ? 'bg-violet-500/15 border-violet-500 text-theme-main shadow-xs cursor-pointer'
                          : 'bg-theme-elevated border-theme-subtle text-theme-muted hover:border-theme-subtle hover:text-theme-secondary cursor-pointer'
                      }`}
                    >
                      <span className="text-xs font-bold text-theme-main">EDIT</span>
                      <span className="text-[10px] text-theme-muted mt-1 leading-snug">
                        Full metadata and tag collaboration.
                      </span>
                    </button>
                  )}
                </div>

                {isStudent && (
                  <p className="text-[11px] text-amber-500 mt-1.5 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Student accounts have read-only access and cannot request annotation or edit permissions.
                  </p>
                )}
              </div>

              {/* Reason textarea */}
              <div>
                <label className="block text-xs font-bold text-theme-secondary mb-1">
                  Reason / Research Context (Optional)
                </label>
                <textarea
                  rows={3}
                  disabled={hasActivePending}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why you are requesting access (e.g. lab collaboration, peer review, comparative benchmark)..."
                  maxLength={500}
                  className="w-full px-3 py-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-theme-main placeholder:text-theme-muted resize-none disabled:opacity-50"
                />
                <span className="text-[10px] text-theme-muted block text-right mt-0.5">
                  {reason.length}/500
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-theme-elevated hover:bg-theme-subtle text-theme-secondary transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || hasActivePending}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{hasActivePending ? 'Already Requested' : 'Send Access Request'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
