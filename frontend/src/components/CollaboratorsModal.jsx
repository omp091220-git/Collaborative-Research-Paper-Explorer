import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function CollaboratorsModal({ paper, isOpen, onClose }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('COMMENT');
  const [inviting, setInviting] = useState(false);

  const fetchCollaborators = useCallback(async () => {
    if (!paper?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/papers/${paper.id}/collaborators`, {
        withCredentials: true,
      });
      setData(res.data);
    } catch (err) {
      setError(
        err.response?.data?.error || 'Failed to load collaborator information.'
      );
    } finally {
      setLoading(false);
    }
  }, [paper?.id]);

  useEffect(() => {
    if (isOpen) {
      fetchCollaborators();
      setSuccess(null);
      setError(null);
    }
  }, [isOpen, fetchCollaborators]);

  if (!isOpen) return null;

  const canManage = data?.permissions?.canManage;

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await axios.post(
        `/api/papers/${paper.id}/collaborators/invite`,
        { email: inviteEmail.trim(), role: inviteRole },
        { withCredentials: true }
      );
      setSuccess(res.data.message || 'Invitation sent successfully!');
      setInviteEmail('');
      fetchCollaborators();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to invite collaborator.');
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    setError(null);
    setSuccess(null);
    try {
      await axios.patch(
        `/api/papers/${paper.id}/collaborators/${userId}`,
        { role: newRole },
        { withCredentials: true }
      );
      setSuccess('Collaborator permission updated.');
      fetchCollaborators();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update role.');
    }
  };

  const handleRemoveCollaborator = async (userId, isSelf = false) => {
    if (
      !window.confirm(
        isSelf
          ? 'Are you sure you want to leave this paper collaboration?'
          : 'Are you sure you want to remove this collaborator?'
      )
    ) {
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      await axios.delete(`/api/papers/${paper.id}/collaborators/${userId}`, {
        withCredentials: true,
      });
      setSuccess(isSelf ? 'You have left the collaboration.' : 'Collaborator removed.');
      if (isSelf) {
        onClose();
      } else {
        fetchCollaborators();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove collaborator.');
    }
  };

  const handleRevokeInvitation = async (invitationId) => {
    setError(null);
    setSuccess(null);
    try {
      await axios.delete(
        `/api/papers/${paper.id}/collaborators/invitations/${invitationId}`,
        { withCredentials: true }
      );
      setSuccess('Invitation revoked.');
      fetchCollaborators();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to revoke invitation.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">👥</span>
              <h2 className="text-lg font-bold text-slate-800">
                Paper Collaborators
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1" title={paper?.title}>
              {paper?.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-sm">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs">
              {success}
            </div>
          )}

          {loading && !data && (
            <div className="py-12 text-center text-slate-400 text-xs">
              Loading collaborator data...
            </div>
          )}

          {data && (
            <>
              {/* Permission Banner */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-600">Your Effective Access:</span>
                <span
                  className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                    data.my_role === 'OWNER'
                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                      : data.my_role === 'EDIT'
                      ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                      : data.my_role === 'COMMENT'
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  {data.my_role || 'VIEW ONLY'}
                </span>
              </div>

              {/* Invite Form (Owner / Admin only) */}
              {canManage && (
                <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-3">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Invite Collaborator
                  </h3>
                  <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="email"
                      required
                      placeholder="colleague@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800 font-medium"
                    >
                      <option value="VIEW">View (Read-only)</option>
                      <option value="COMMENT">Comment (Discussions)</option>
                      <option value="EDIT">Edit (Full Collaboration)</option>
                    </select>
                    <button
                      type="submit"
                      disabled={inviting}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer shrink-0"
                    >
                      {inviting ? 'Inviting...' : 'Invite'}
                    </button>
                  </form>
                  <p className="text-[11px] text-slate-500">
                    * Invitees without an existing account can accept after registering with the same email.
                  </p>
                </div>
              )}

              {/* Paper Owner */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Paper Owner
                </h3>
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      {data.owner?.full_name || 'Unknown'}
                    </p>
                    <p className="text-[11px] text-slate-500">{data.owner?.email}</p>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 rounded-md">
                    Owner
                  </span>
                </div>
              </div>

              {/* Active Collaborators */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Collaborators ({data.collaborators?.length || 0})
                </h3>
                {data.collaborators?.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">
                    No collaborators added yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.collaborators.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white rounded-xl border border-slate-200 shadow-2xs gap-2"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-800">
                              {c.full_name}
                            </p>
                            {c.user_id === user?.id && (
                              <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.2 rounded">
                                (You)
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">{c.email}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {canManage ? (
                            <>
                              <select
                                value={c.role}
                                onChange={(e) => handleUpdateRole(c.user_id, e.target.value)}
                                className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-slate-50 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              >
                                <option value="VIEW">View</option>
                                <option value="COMMENT">Comment</option>
                                <option value="EDIT">Edit</option>
                              </select>
                              <button
                                onClick={() => handleRemoveCollaborator(c.user_id, false)}
                                className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition cursor-pointer"
                                title="Remove Collaborator"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <>
                              <span
                                className={`px-2 py-0.5 text-xs font-semibold rounded-md ${
                                  c.role === 'EDIT'
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : c.role === 'COMMENT'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {c.role}
                              </span>
                              {c.user_id === user?.id && (
                                <button
                                  onClick={() => handleRemoveCollaborator(c.user_id, true)}
                                  className="text-xs text-red-500 hover:underline cursor-pointer ml-2"
                                >
                                  Leave
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending Invitations (Manager only) */}
              {canManage && data.pending_invitations?.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Pending Invitations ({data.pending_invitations.length})
                  </h3>
                  <div className="space-y-2">
                    {data.pending_invitations.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between p-3 bg-amber-50/50 rounded-xl border border-amber-200/60 shadow-2xs text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-800">
                            {inv.invited_email}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Tier: <strong>{inv.role}</strong> • Status: PENDING
                          </p>
                        </div>
                        <button
                          onClick={() => handleRevokeInvitation(inv.id)}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-100 rounded transition cursor-pointer"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
