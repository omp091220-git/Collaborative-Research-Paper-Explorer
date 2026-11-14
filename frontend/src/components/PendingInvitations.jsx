import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export default function PendingInvitations({ onInvitationHandled }) {
  const [invitations, setInvitations] = useState([]);
  const [actionLoading, setActionLoading] = useState({});
  const [error, setError] = useState(null);

  const fetchInvitations = useCallback(async () => {
    try {
      const res = await axios.get('/api/invitations/my-invitations', {
        withCredentials: true,
      });
      setInvitations(res.data.invitations || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const handleAction = async (invitationId, action) => {
    setActionLoading((prev) => ({ ...prev, [invitationId]: action }));
    setError(null);
    try {
      await axios.post(
        `/api/invitations/${invitationId}/${action}`,
        {},
        { withCredentials: true }
      );
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      if (onInvitationHandled) onInvitationHandled();
    } catch (err) {
      setError(
        err.response?.data?.error || `Failed to ${action} invitation.`
      );
    } finally {
      setActionLoading((prev) => ({ ...prev, [invitationId]: null }));
    }
  };

  if (invitations.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-5 shadow-xs">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">✉️</span>
        <h3 className="text-base font-bold text-indigo-950">
          Collaboration Invitations ({invitations.length})
        </h3>
      </div>

      {error && (
        <div className="mb-3 text-xs p-2.5 bg-red-100 text-red-800 rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white rounded-xl border border-indigo-100 shadow-2xs gap-3"
          >
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {inv.paper_title}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-slate-500">
                  Invited by: <strong>{inv.inviter_name || inv.inviter_email}</strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-500">Tier:</span>
                <span
                  className={`px-2 py-0.5 text-xs font-semibold rounded-md ${
                    inv.role === 'EDIT'
                      ? 'bg-purple-100 text-purple-700'
                      : inv.role === 'COMMENT'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {inv.role}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                disabled={Boolean(actionLoading[inv.id])}
                onClick={() => handleAction(inv.id, 'accept')}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition cursor-pointer shadow-xs"
              >
                {actionLoading[inv.id] === 'accept' ? 'Accepting...' : 'Accept'}
              </button>
              <button
                disabled={Boolean(actionLoading[inv.id])}
                onClick={() => handleAction(inv.id, 'decline')}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition cursor-pointer"
              >
                {actionLoading[inv.id] === 'decline' ? 'Declining...' : 'Decline'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
