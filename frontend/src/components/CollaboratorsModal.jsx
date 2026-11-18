import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import Button from './common/Button';

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
      setSuccess(
        isSelf
          ? 'You have left the collaboration.'
          : 'Collaborator removed successfully.'
      );
      if (isSelf) {
        setTimeout(onClose, 1000);
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
      await axios.delete(`/api/papers/invitations/${invitationId}`, {
        withCredentials: true,
      });
      setSuccess('Invitation revoked.');
      fetchCollaborators();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to revoke invitation.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-theme-card rounded-2xl shadow-2xl border border-theme-subtle w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-theme-subtle flex items-start justify-between gap-4 bg-theme-elevated">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">👥</span>
              <h2 className="text-lg font-bold text-theme-main">
                Paper Collaborators
              </h2>
            </div>
            <p className="text-xs text-theme-muted mt-0.5 line-clamp-1" title={paper?.title}>
              {paper?.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-theme-muted hover:text-theme-main p-1.5 rounded-lg hover:bg-theme-card transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-sm">
          {error && (
            <div className="p-3 bg-rose-500/10 text-rose-300 border border-rose-500/30 rounded-xl text-xs">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs">
              {success}
            </div>
          )}

          {loading && !data && (
            <div className="py-12 text-center text-theme-muted text-xs">
              Loading collaborator data...
            </div>
          )}

          {data && (
            <>
              {/* Permission Banner */}
              <div className="flex items-center justify-between p-3.5 bg-theme-elevated rounded-xl border border-theme-subtle">
                <span className="text-xs text-theme-secondary">Your Effective Access:</span>
                <span
                  className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                    data.my_role === 'OWNER'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : data.my_role === 'EDIT'
                      ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                      : data.my_role === 'COMMENT'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'bg-theme-card text-theme-secondary border border-theme-subtle'
                  }`}
                >
                  {data.my_role || 'VIEW ONLY'}
                </span>
              </div>

              {/* Invite Form (Owner / Admin only) */}
              {canManage && (
                <div className="p-4 bg-violet-500/10 rounded-xl border border-violet-500/20 space-y-3">
                  <h3 className="text-xs font-bold text-theme-main uppercase tracking-wider">
                    Invite Collaborator
                  </h3>
                  <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="email"
                      required
                      placeholder="colleague@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-theme-main placeholder:text-theme-muted"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="px-3 py-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-theme-main font-medium cursor-pointer"
                    >
                      <option value="VIEW">View (Read-only)</option>
                      <option value="COMMENT">Comment (Discussions)</option>
                      <option value="EDIT">Edit (Full Collaboration)</option>
                    </select>
                    <Button
                      variant="primary"
                      size="sm"
                      type="submit"
                      loading={inviting}
                      className="shrink-0"
                    >
                      Invite
                    </Button>
                  </form>
                  <p className="text-[11px] text-theme-muted">
                    * Invitees without an existing account can accept after registering with the same email.
                  </p>
                </div>
              )}

              {/* Paper Owner */}
              <div>
                <h3 className="text-xs font-bold text-theme-muted uppercase tracking-wider mb-2">
                  Paper Owner
                </h3>
                <div className="flex items-center justify-between p-3 bg-theme-elevated rounded-xl border border-theme-subtle shadow-2xs">
                  <div>
                    <p className="text-xs font-bold text-theme-main">
                      {data.owner?.full_name || 'Unknown'}
                    </p>
                    <p className="text-[11px] text-theme-muted">{data.owner?.email}</p>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-md">
                    Owner
                  </span>
                </div>
              </div>

              {/* Active Collaborators */}
              <div>
                <h3 className="text-xs font-bold text-theme-muted uppercase tracking-wider mb-2">
                  Collaborators ({data.collaborators?.length || 0})
                </h3>
                {data.collaborators?.length === 0 ? (
                  <p className="text-xs text-theme-muted italic py-2">
                    No collaborators added yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.collaborators.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-theme-elevated rounded-xl border border-theme-subtle shadow-2xs gap-2"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-theme-main">
                              {c.full_name}
                            </p>
                            {c.user_id === user?.id && (
                              <span className="text-[10px] text-violet-400 font-semibold bg-violet-500/15 px-1.5 py-0.5 rounded">
                                (You)
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-theme-muted">{c.email}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {canManage ? (
                            <>
                              <select
                                value={c.role}
                                onChange={(e) => handleUpdateRole(c.user_id, e.target.value)}
                                className="px-2 py-1 text-xs border border-theme-subtle rounded-lg bg-theme-card font-medium text-theme-main focus:outline-none focus:ring-1 focus:ring-violet-400 cursor-pointer"
                              >
                                <option value="VIEW">View</option>
                                <option value="COMMENT">Comment</option>
                                <option value="EDIT">Edit</option>
                              </select>
                              <button
                                onClick={() => handleRemoveCollaborator(c.user_id, false)}
                                className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 p-1 rounded transition cursor-pointer"
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
                                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                                    : c.role === 'COMMENT'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                    : 'bg-theme-card text-theme-secondary border border-theme-subtle'
                                }`}
                              >
                                {c.role}
                              </span>
                              {c.user_id === user?.id && (
                                <button
                                  onClick={() => handleRemoveCollaborator(c.user_id, true)}
                                  className="text-xs text-rose-400 hover:underline cursor-pointer ml-2"
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
                  <h3 className="text-xs font-bold text-theme-muted uppercase tracking-wider mb-2">
                    Pending Invitations ({data.pending_invitations.length})
                  </h3>
                  <div className="space-y-2">
                    {data.pending_invitations.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 shadow-2xs text-xs"
                      >
                        <div>
                          <p className="font-semibold text-theme-main">
                            {inv.invited_email}
                          </p>
                          <p className="text-[10px] text-theme-muted">
                            Tier: <strong className="text-amber-400">{inv.role}</strong> • Status: PENDING
                          </p>
                        </div>
                        <button
                          onClick={() => handleRevokeInvitation(inv.id)}
                          className="px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/10 rounded transition cursor-pointer"
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
        <div className="p-4 border-t border-theme-subtle bg-theme-elevated flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
