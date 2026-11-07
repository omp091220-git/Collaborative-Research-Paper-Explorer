import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Mail, Check, X } from 'lucide-react';

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
    <div className="bg-gradient-to-r from-indigo-50/90 to-purple-50/90 border border-indigo-200 rounded-2xl p-5 shadow-xs">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">
          <Mail className="w-4 h-4" />
        </div>
        <h3 className="text-base font-bold text-indigo-950">
          Collaboration Invitations ({invitations.length})
        </h3>
      </div>

      {error && (
        <div className="mb-3 text-xs p-2.5 bg-red-100 border border-red-200 text-red-800 rounded-lg font-medium">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white rounded-xl border border-indigo-200/80 shadow-2xs gap-3"
          >
            <div>
              <p className="text-sm font-bold text-slate-900">
                {inv.paper_title}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-slate-700">
                  Invited by: <strong className="text-slate-900">{inv.inviter_name || inv.inviter_email}</strong>
                </span>
                <span className="text-slate-400">•</span>
                <span className="text-xs text-slate-700 font-medium">Tier:</span>
                <span
                  className={`px-2 py-0.5 text-xs font-bold rounded-md ${
                    inv.role === 'EDIT'
                      ? 'bg-purple-100 text-purple-900 border border-purple-200'
                      : inv.role === 'COMMENT'
                      ? 'bg-blue-100 text-blue-900 border border-blue-200'
                      : 'bg-slate-100 text-slate-800 border border-slate-300'
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
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition cursor-pointer shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{actionLoading[inv.id] === 'accept' ? 'Accepting...' : 'Accept'}</span>
              </button>
              <button
                disabled={Boolean(actionLoading[inv.id])}
                onClick={() => handleAction(inv.id, 'decline')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 disabled:opacity-50 rounded-lg transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>{actionLoading[inv.id] === 'decline' ? 'Declining...' : 'Decline'}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
