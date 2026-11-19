import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function DiscussionPanel({ paper, isOpen, onClose }) {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [myRole, setMyRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Active expanded thread details
  const [expandedThreadId, setExpandedThreadId] = useState(null);
  const [threadDetails, setThreadDetails] = useState({}); // { [id]: { thread, messages } }
  const [loadingThread, setLoadingThread] = useState(false);

  // New Thread Form
  const [showNewThread, setShowNewThread] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAnchorType, setNewAnchorType] = useState('text_highlight');
  const [newPageNumber, setNewPageNumber] = useState(1);
  const [newSelectedText, setNewSelectedText] = useState('');
  const [newFigureCaption, setNewFigureCaption] = useState('');
  const [newContent, setNewContent] = useState('');
  const [creatingThread, setCreatingThread] = useState(false);

  // Reply Form
  const [replyText, setReplyText] = useState('');
  const [replyParentId, setReplyParentId] = useState(null);
  const [postingReply, setPostingReply] = useState(false);

  // Fetch threads and collaboration permissions
  const fetchThreads = useCallback(async () => {
    if (!paper?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [threadRes, collabRes] = await Promise.all([
        axios.get(`/api/papers/${paper.id}/discussions`, { withCredentials: true }),
        axios.get(`/api/papers/${paper.id}/collaborators`, { withCredentials: true }),
      ]);
      setThreads(threadRes.data.threads || []);
      setCollaborators(collabRes.data.collaborators || []);
      setMyRole(collabRes.data.my_role);
    } catch (err) {
      setError(
        err.response?.data?.error || 'Failed to load discussions for this paper.'
      );
    } finally {
      setLoading(false);
    }
  }, [paper?.id]);

  useEffect(() => {
    if (isOpen) {
      fetchThreads();
      setExpandedThreadId(null);
      setShowNewThread(false);
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, fetchThreads]);

  // Fetch specific thread messages when expanded
  const loadThreadMessages = async (threadId) => {
    setLoadingThread(true);
    try {
      const res = await axios.get(
        `/api/papers/${paper.id}/discussions/${threadId}`,
        { withCredentials: true }
      );
      setThreadDetails((prev) => ({
        ...prev,
        [threadId]: res.data,
      }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load thread messages.');
    } finally {
      setLoadingThread(false);
    }
  };

  const handleToggleExpand = (threadId) => {
    if (expandedThreadId === threadId) {
      setExpandedThreadId(null);
      setReplyParentId(null);
      setReplyText('');
    } else {
      setExpandedThreadId(threadId);
      setReplyParentId(null);
      setReplyText('');
      loadThreadMessages(threadId);
    }
  };

  const handleCreateThread = async (e) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    setCreatingThread(true);
    setError(null);
    setSuccess(null);

    const anchorData = {};
    if (newAnchorType === 'text_highlight') {
      anchorData.page_number = Number(newPageNumber);
      anchorData.selected_text = newSelectedText.trim();
    } else if (newAnchorType === 'figure') {
      anchorData.page_number = Number(newPageNumber);
      anchorData.figure_caption = newFigureCaption.trim();
    }

    try {
      await axios.post(
        `/api/papers/${paper.id}/discussions`,
        {
          title: newTitle.trim(),
          anchor_type: newAnchorType,
          anchor_data: anchorData,
          content: newContent.trim(),
        },
        { withCredentials: true }
      );
      setSuccess('Discussion thread created successfully!');
      setNewTitle('');
      setNewSelectedText('');
      setNewFigureCaption('');
      setNewContent('');
      setShowNewThread(false);
      fetchThreads();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create discussion thread.');
    } finally {
      setCreatingThread(false);
    }
  };

  const handlePostReply = async (threadId) => {
    if (!replyText.trim()) return;

    setPostingReply(true);
    setError(null);
    try {
      await axios.post(
        `/api/papers/${paper.id}/discussions/${threadId}/messages`,
        {
          content: replyText.trim(),
          parent_id: replyParentId || undefined,
        },
        { withCredentials: true }
      );
      setReplyText('');
      setReplyParentId(null);
      loadThreadMessages(threadId);
      fetchThreads();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post reply.');
    } finally {
      setPostingReply(false);
    }
  };

  const handleUpdateStatus = async (threadId, newStatus) => {
    setError(null);
    try {
      await axios.patch(
        `/api/papers/${paper.id}/discussions/${threadId}`,
        { status: newStatus },
        { withCredentials: true }
      );
      loadThreadMessages(threadId);
      fetchThreads();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update thread status.');
    }
  };

  const handleDeleteMessage = async (threadId, messageId) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;
    setError(null);
    try {
      await axios.delete(
        `/api/papers/${paper.id}/discussions/${threadId}/messages/${messageId}`,
        { withCredentials: true }
      );
      loadThreadMessages(threadId);
      fetchThreads();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete message.');
    }
  };

  const handleDeleteThread = async (threadId) => {
    if (!window.confirm('Delete this entire discussion thread and all replies?')) return;
    setError(null);
    try {
      await axios.delete(`/api/papers/${paper.id}/discussions/${threadId}`, {
        withCredentials: true,
      });
      setExpandedThreadId(null);
      fetchThreads();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete thread.');
    }
  };

  const insertMention = (mentionToken, isReply = false) => {
    if (isReply) {
      setReplyText((prev) => `${prev} @${mentionToken} `);
    } else {
      setNewContent((prev) => `${prev} @${mentionToken} `);
    }
  };

  // Helper to highlight @mentions inside text
  const renderMessageContent = (content) => {
    if (!content) return null;
    const parts = content.split(/(@[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|@[a-zA-Z0-9_.-]+)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('@')) {
        return (
          <span
            key={idx}
            className="inline-block px-1.5 py-0.2 mx-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-700"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  if (!isOpen) return null;

  const isStudent = user?.role === 'STUDENT';
  const isViewOnly = isStudent || myRole === 'VIEW' || !myRole;

  const filteredThreads = threads.filter((t) => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    if (typeFilter !== 'ALL' && t.anchor_type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end p-0 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-theme-card sm:rounded-2xl shadow-2xl border border-theme-subtle w-full sm:max-w-2xl h-full sm:h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-theme-subtle flex items-center justify-between gap-4 bg-theme-elevated">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">💬</span>
              <h2 className="text-lg font-bold text-theme-main">
                Contextual Discussions
              </h2>
              <span
                className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                  myRole === 'OWNER'
                    ? 'bg-purple-500/20 text-purple-300'
                    : myRole === 'EDIT'
                    ? 'bg-violet-500/20 text-violet-300'
                    : myRole === 'COMMENT'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'bg-theme-card text-theme-secondary border border-theme-subtle'
                }`}
              >
                {myRole || 'VIEW ONLY'}
              </span>
            </div>
            <p className="text-xs text-theme-muted mt-0.5 line-clamp-1" title={paper?.title}>
              {paper?.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-theme-muted hover:text-theme-main p-1.5 rounded-lg hover:bg-theme-elevated transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Action / Filter Bar */}
        <div className="p-3 border-b border-theme-subtle bg-theme-card flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1 bg-theme-elevated border border-theme-subtle rounded-lg text-theme-main focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="RESOLVED">Resolved</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1 bg-theme-elevated border border-theme-subtle rounded-lg text-theme-main focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
            >
              <option value="ALL">All Anchors</option>
              <option value="text_highlight">Text Highlights</option>
              <option value="figure">Figures</option>
              <option value="annotation">Annotations</option>
              <option value="general">General</option>
            </select>
          </div>

          {!isViewOnly && (
            <button
              onClick={() => setShowNewThread((prev) => !prev)}
              className="px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-semibold transition cursor-pointer shadow-xs"
            >
              {showNewThread ? 'Cancel' : '+ New Thread'}
            </button>
          )}
        </div>

        {/* View-Only Notice */}
        {isViewOnly && (
          <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
            <span>ℹ️</span>
            <span>You have View-only permissions. You can read threads but cannot create discussions or post replies.</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

          {/* New Discussion Thread Form */}
          {showNewThread && !isViewOnly && (
            <form
              onSubmit={handleCreateThread}
              className="p-4 bg-theme-elevated rounded-2xl border border-violet-500/30 shadow-sm space-y-3"
            >
              <h3 className="text-xs font-bold text-violet-300 uppercase tracking-wider">
                Start New Discussion Thread
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-theme-secondary mb-1">
                    Thread Title (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Question regarding Figure 2"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-theme-card border border-theme-subtle rounded-xl text-theme-main placeholder:text-theme-muted focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-theme-secondary mb-1">
                    Anchor Type
                  </label>
                  <select
                    value={newAnchorType}
                    onChange={(e) => setNewAnchorType(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-theme-card border border-theme-subtle rounded-xl text-theme-main focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
                  >
                    <option value="text_highlight">Selected Text Highlight</option>
                    <option value="figure">Extracted Figure</option>
                    <option value="general">General / Paper-wide</option>
                  </select>
                </div>
              </div>

              {/* Anchor details */}
              {newAnchorType === 'text_highlight' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-theme-secondary mb-1">
                      Page #
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={newPageNumber}
                      onChange={(e) => setNewPageNumber(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-theme-card border border-theme-subtle rounded-xl text-theme-main focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-theme-secondary mb-1">
                      Selected Text Quote
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Multi-head self attention..."
                      value={newSelectedText}
                      onChange={(e) => setNewSelectedText(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-theme-card border border-theme-subtle rounded-xl text-theme-main placeholder:text-theme-muted focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {newAnchorType === 'figure' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-theme-secondary mb-1">
                      Page #
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={newPageNumber}
                      onChange={(e) => setNewPageNumber(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-theme-card border border-theme-subtle rounded-xl text-theme-main focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-theme-secondary mb-1">
                      Figure Label / Caption
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Figure 1: Model Architecture"
                      value={newFigureCaption}
                      onChange={(e) => setNewFigureCaption(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-theme-card border border-theme-subtle rounded-xl text-theme-main placeholder:text-theme-muted focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Message Content with Mention Helper */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-theme-secondary">
                    Initial Message *
                  </label>
                  {collaborators.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap text-[10px] text-theme-muted">
                      <span>Mention:</span>
                      {collaborators.slice(0, 3).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => insertMention(c.email, false)}
                          className="px-1.5 py-0.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 rounded transition cursor-pointer"
                        >
                          @{c.full_name?.split(' ')[0] || c.email}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <textarea
                  required
                  rows={3}
                  placeholder="Type your message... use @email or @name to mention collaborators."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full p-2.5 text-xs bg-theme-card border border-theme-subtle rounded-xl text-theme-main placeholder:text-theme-muted focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewThread(false)}
                  className="px-3 py-1.5 text-xs text-theme-secondary hover:bg-theme-card rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingThread}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg transition cursor-pointer shadow-xs"
                >
                  {creatingThread ? 'Posting...' : 'Create Discussion'}
                </button>
              </div>
            </form>
          )}

          {/* Threads Listing */}
          {loading && (
            <div className="py-12 text-center text-theme-muted text-xs">
              Loading discussions...
            </div>
          )}

          {!loading && filteredThreads.length === 0 && (
            <div className="py-12 text-center text-theme-muted text-xs space-y-2">
              <span className="text-3xl block">💭</span>
              <p>No discussion threads match your filter.</p>
              {!isViewOnly && (
                <button
                  onClick={() => setShowNewThread(true)}
                  className="text-violet-400 hover:underline font-semibold cursor-pointer"
                >
                  Start the first discussion!
                </button>
              )}
            </div>
          )}

          {!loading &&
            filteredThreads.map((th) => {
              const isExpanded = expandedThreadId === th.id;
              const details = threadDetails[th.id];

              return (
                <div
                  key={th.id}
                  className={`bg-theme-card border rounded-2xl transition shadow-2xs ${
                    isExpanded
                      ? 'border-violet-500 ring-2 ring-violet-500/20'
                      : 'border-theme-subtle hover:border-theme-strong'
                  }`}
                >
                  {/* Thread Summary Card */}
                  <div
                    onClick={() => handleToggleExpand(th.id)}
                    className="p-4 cursor-pointer flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Anchor Pill */}
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-theme-elevated text-theme-secondary rounded-md border border-theme-subtle">
                            {th.anchor_type === 'text_highlight' && '🖋️ Highlight'}
                            {th.anchor_type === 'figure' && '🖼️ Figure'}
                            {th.anchor_type === 'annotation' && '📌 Annotation'}
                            {th.anchor_type === 'general' && '📄 General'}
                            {th.anchor_data?.page_number && ` • P.${th.anchor_data.page_number}`}
                          </span>

                          <span
                            className={`px-2 py-0.5 text-[11px] font-semibold rounded-md ${
                              th.status === 'RESOLVED'
                                ? 'bg-purple-500/20 text-purple-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {th.status}
                          </span>
                        </div>

                        {/* Title */}
                        <h4 className="font-bold text-sm text-theme-main">
                          {th.title}
                        </h4>

                        {/* Highlighted text preview */}
                        {th.anchor_data?.selected_text && (
                          <p className="text-xs text-theme-muted italic mt-0.5 border-l-2 border-theme-strong pl-2 line-clamp-1">
                            "{th.anchor_data.selected_text}"
                          </p>
                        )}
                        {th.anchor_data?.figure_caption && (
                          <p className="text-xs text-theme-muted mt-0.5">
                            Caption: <strong>{th.anchor_data.figure_caption}</strong>
                          </p>
                        )}
                      </div>

                      {/* Reply counter */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="px-2 py-0.5 text-xs font-semibold bg-theme-elevated text-theme-secondary rounded-full">
                          💬 {th.message_count || 1}
                        </span>
                        <span className="text-[10px] text-theme-muted">
                          {new Date(th.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-theme-muted pt-1 border-t border-theme-subtle">
                      <span>Started by: <strong>{th.creator_name || th.creator_email}</strong></span>
                      <span className="text-violet-400 font-semibold hover:underline">
                        {isExpanded ? 'Collapse ▲' : 'View Thread ▼'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Thread Messages & Reply Input */}
                  {isExpanded && (
                    <div className="border-t border-theme-subtle bg-theme-elevated p-4 space-y-4">
                      {loadingThread && !details && (
                        <div className="text-center py-4 text-xs text-theme-muted">
                          Loading messages...
                        </div>
                      )}

                      {/* Thread Control Bar */}
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-theme-subtle text-xs">
                        <div className="flex items-center gap-2">
                          {!isViewOnly && (
                            <button
                              onClick={() =>
                                handleUpdateStatus(
                                  th.id,
                                  th.status === 'RESOLVED' ? 'OPEN' : 'RESOLVED'
                                )
                              }
                              className={`px-2.5 py-1 rounded-md font-semibold text-xs transition cursor-pointer ${
                                th.status === 'RESOLVED'
                                  ? 'bg-theme-card hover:bg-theme-elevated text-theme-secondary border border-theme-subtle'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              }`}
                            >
                              {th.status === 'RESOLVED' ? 'Re-open' : '✓ Mark Resolved'}
                            </button>
                          )}
                        </div>

                        {!isStudent && (th.created_by === user?.id || myRole === 'OWNER') && (
                          <button
                            onClick={() => handleDeleteThread(th.id)}
                            className="text-xs text-rose-400 hover:text-rose-300 hover:underline cursor-pointer"
                          >
                            Delete Thread
                          </button>
                        )}
                      </div>

                      {/* Messages History */}
                      {details?.messages && (
                        <div className="space-y-3">
                          {details.messages.map((m) => {
                            const isChild = Boolean(m.parent_id);
                            return (
                              <div
                                key={m.id}
                                className={`p-3 rounded-xl border transition ${
                                  isChild
                                    ? 'ml-6 sm:ml-8 bg-theme-elevated/70 border-theme-subtle'
                                    : 'bg-theme-card border-theme-subtle shadow-2xs'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-theme-main">
                                      {m.user_name || m.user_email}
                                    </span>
                                    {m.user_id === user?.id && (
                                      <span className="text-[10px] text-violet-400 font-semibold bg-violet-500/10 px-1.5 py-0.5 rounded">
                                        You
                                      </span>
                                    )}
                                    {isChild && (
                                      <span className="text-[10px] text-theme-muted">
                                        ↳ replied
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-theme-muted">
                                    {new Date(m.created_at).toLocaleTimeString([], {
                                       hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>

                                <div className="text-xs text-theme-secondary leading-relaxed whitespace-pre-wrap">
                                  {renderMessageContent(m.content)}
                                </div>

                                <div className="flex items-center justify-end gap-3 mt-2 pt-1 border-t border-theme-subtle text-[11px]">
                                  {!isViewOnly && (
                                    <button
                                      onClick={() => {
                                        setReplyParentId(m.id);
                                        insertMention(m.user_email, true);
                                      }}
                                      className="text-violet-400 hover:underline font-medium cursor-pointer"
                                    >
                                      Reply
                                    </button>
                                  )}
                                  {!isStudent && (m.user_id === user?.id || myRole === 'OWNER') && (
                                    <button
                                      onClick={() => handleDeleteMessage(th.id, m.id)}
                                      className="text-rose-400 hover:underline cursor-pointer"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Reply Input Box */}
                      {!isViewOnly && (
                        <div className="mt-3 p-3 bg-theme-card rounded-xl border border-theme-subtle shadow-2xs space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-theme-main">
                              {replyParentId ? 'Replying to comment' : 'Post Reply'}
                            </span>
                            {replyParentId && (
                              <button
                                onClick={() => setReplyParentId(null)}
                                className="text-theme-muted hover:text-theme-secondary text-[11px]"
                              >
                                Cancel thread reply
                              </button>
                            )}
                          </div>

                          {/* Quick Mention Pills */}
                          {collaborators.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap text-[10px] text-theme-muted">
                              <span>Mention:</span>
                              {collaborators.slice(0, 4).map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => insertMention(c.email, true)}
                                  className="px-1.5 py-0.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 rounded transition cursor-pointer"
                                >
                                  @{c.full_name?.split(' ')[0] || c.email}
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <textarea
                              rows={2}
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              placeholder="Write your response... use @mention to notify."
                              className="flex-1 p-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl text-theme-main placeholder:text-theme-muted focus:outline-none focus:ring-1 focus:ring-violet-500"
                            />
                            <button
                              disabled={postingReply || !replyText.trim()}
                              onClick={() => handlePostReply(th.id)}
                              className="px-4 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer shrink-0"
                            >
                              {postingReply ? '...' : 'Reply'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-theme-subtle bg-theme-elevated flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-theme-secondary bg-theme-card border border-theme-subtle rounded-lg hover:bg-theme-elevated transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
