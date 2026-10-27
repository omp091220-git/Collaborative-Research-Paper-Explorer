import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function PaperList({ refreshTrigger, selectedPaperId }) {
  const { isResearcher, isAdmin } = useAuth();
  const canEdit = isResearcher || isAdmin;

  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  // Expandable sections
  const [activeCommentsPaperId, setActiveCommentsPaperId] = useState(selectedPaperId || null);
  const [comments, setComments] = useState({});
  const [commentInput, setCommentInput] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // Edit Paper Modal state
  const [editingPaper, setEditingPaper] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAbstract, setEditAbstract] = useState('');
  const [editAuthors, setEditAuthors] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editSuccess, setEditSuccess] = useState(null);

  const fetchPapers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/papers', { withCredentials: true });
      setPapers(res.data.papers || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load papers.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadComments = useCallback(async (paperId) => {
    try {
      const res = await axios.get(`/api/papers/${paperId}/comments`, {
        withCredentials: true,
      });
      setComments((prev) => ({ ...prev, [paperId]: res.data.comments || [] }));
    } catch {
      // Quiet fail if comments table or endpoint empty
    }
  }, []);

  useEffect(() => {
    let active = true;
    axios
      .get('/api/papers', { withCredentials: true })
      .then((res) => {
        if (active) setPapers(res.data.papers || []);
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.error || 'Failed to load papers.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshTrigger]);

  useEffect(() => {
    if (!selectedPaperId) return;
    let active = true;
    axios
      .get(`/api/papers/${selectedPaperId}/comments`, { withCredentials: true })
      .then((res) => {
        if (active) {
          setComments((prev) => ({
            ...prev,
            [selectedPaperId]: res.data.comments || [],
          }));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedPaperId]);

  // Star / Unstar paper
  const handleToggleStar = async (paper) => {
    const isStarred = paper.is_starred;
    const currentCount = paper.star_count || 0;

    // Optimistic UI update
    setPapers((prev) =>
      prev.map((p) =>
        p.id === paper.id
          ? {
              ...p,
              is_starred: !isStarred,
              star_count: isStarred ? Math.max(0, currentCount - 1) : currentCount + 1,
            }
          : p
      )
    );

    try {
      if (isStarred) {
        await axios.delete(`/api/papers/${paper.id}/star`, { withCredentials: true });
      } else {
        await axios.post(`/api/papers/${paper.id}/star`, {}, { withCredentials: true });
      }
    } catch (err) {
      console.error('Failed to update star state:', err);
      fetchPapers();
    }
  };

  const handleToggleComments = (paperId) => {
    if (activeCommentsPaperId === paperId) {
      setActiveCommentsPaperId(null);
    } else {
      setActiveCommentsPaperId(paperId);
      loadComments(paperId);
    }
  };

  const handlePostComment = async (paperId) => {
    if (!commentInput.trim()) return;
    setCommentSubmitting(true);
    try {
      const res = await axios.post(
        `/api/papers/${paperId}/comments`,
        { content: commentInput.trim() },
        { withCredentials: true }
      );
      setComments((prev) => ({
        ...prev,
        [paperId]: [...(prev[paperId] || []), res.data.comment],
      }));
      setCommentInput('');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to post comment.');
    } finally {
      setCommentSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (paper) => {
    setEditingPaper(paper);
    setEditTitle(paper.title || '');
    setEditAbstract(paper.abstract || '');
    setEditAuthors(Array.isArray(paper.authors) ? paper.authors.join(', ') : '');
    setEditError(null);
    setEditSuccess(null);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingPaper) return;
    setEditLoading(true);
    setEditError(null);
    setEditSuccess(null);

    const authorsArray = editAuthors
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);

    try {
      const res = await axios.patch(
        `/api/papers/${editingPaper.id}`,
        {
          title: editTitle.trim(),
          abstract: editAbstract.trim() || null,
          authors: authorsArray,
        },
        { withCredentials: true }
      );

      setEditSuccess(res.data.message || 'Paper updated successfully.');
      setPapers((prev) =>
        prev.map((p) => (p.id === editingPaper.id ? { ...p, ...res.data.paper } : p))
      );
      setTimeout(() => {
        setEditingPaper(null);
      }, 1000);
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to update paper.');
    } finally {
      setEditLoading(false);
    }
  };

  const filtered = papers.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.title?.toLowerCase().includes(q) ||
      p.abstract?.toLowerCase().includes(q) ||
      p.authors?.some((a) => a.toLowerCase().includes(q)) ||
      p.arxiv_id?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <span>📖</span> Research Papers
          {!loading && (
            <span className="text-sm font-normal text-slate-400">({filtered.length})</span>
          )}
        </h2>
        <div className="flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search papers…"
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-slate-800 placeholder-slate-400 w-52"
          />
          <button
            type="button"
            onClick={fetchPapers}
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-medium transition cursor-pointer"
            title="Refresh"
          >
            ↺
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 text-slate-400 text-sm gap-2">
          <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
          Loading papers…
        </div>
      )}

      {!loading && error && (
        <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-lg text-sm">
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-10 text-slate-400 text-sm">
          {search ? 'No papers match your search.' : 'No papers yet. Upload or import one above!'}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((paper) => {
            const isCommentsOpen =
              (activeCommentsPaperId ?? selectedPaperId) === paper.id;
            const paperComments = comments[paper.id] || [];

            return (
              <div
                key={paper.id}
                id={`paper-${paper.id}`}
                className="p-5 border border-slate-200 rounded-xl bg-slate-50/40 hover:bg-slate-50/70 transition space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3
                        className="font-bold text-slate-900 text-base leading-snug"
                        title={paper.title}
                      >
                        {paper.title}
                      </h3>
                      {paper.arxiv_id && (
                        <a
                          href={`https://arxiv.org/abs/${paper.arxiv_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 border border-orange-200 rounded font-medium hover:bg-orange-200 transition"
                        >
                          arXiv:{paper.arxiv_id}
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1 font-medium">
                      By {paper.authors?.join(', ')}
                    </p>
                    {paper.abstract && (
                      <p className="text-xs text-slate-600 mt-2 line-clamp-3 leading-relaxed">
                        {paper.abstract}
                      </p>
                    )}
                  </div>

                  {/* Actions column */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {/* Star Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleStar(paper)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        paper.is_starred
                          ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                      }`}
                      title={paper.is_starred ? 'Click to unstar' : 'Click to star (receive updates)'}
                    >
                      <span className={paper.is_starred ? 'text-amber-500' : 'text-slate-400'}>
                        {paper.is_starred ? '★' : '☆'}
                      </span>
                      <span>{paper.is_starred ? 'Starred' : 'Star'}</span>
                      <span className="text-[11px] font-normal text-slate-400">
                        ({paper.star_count || 0})
                      </span>
                    </button>

                    {/* Edit Metadata Button */}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEditModal(paper)}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                        title="Edit metadata (notifies starrers of changes)"
                      >
                        ✏️ Edit
                      </button>
                    )}
                  </div>
                </div>

                {/* Footer bar */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs text-slate-400">
                  <div className="flex items-center gap-4">
                    <span>
                      Added{' '}
                      {new Date(paper.uploaded_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    {paper.file_size_bytes && (
                      <span>{(paper.file_size_bytes / 1_048_576).toFixed(1)} MB</span>
                    )}
                  </div>

                  {/* Comments / Discussion Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleComments(paper.id)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span>💬</span>
                    <span>Discussions & Mentions</span>
                    <span>{isCommentsOpen ? '▲' : '▼'}</span>
                  </button>
                </div>

                {/* Expandable Discussions & Mentions Section */}
                {isCommentsOpen && (
                  <div className="mt-3 p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Paper Discussion & User Mentions
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        Tip: use @username to notify researchers
                      </span>
                    </div>

                    {/* Comments list */}
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {paperComments.length === 0 && (
                        <p className="text-xs text-slate-400 py-3 text-center">
                          No discussion comments yet. Start the conversation by mentioning a peer with @username!
                        </p>
                      )}
                      {paperComments.map((c) => (
                        <div
                          key={c.id}
                          className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-800">
                              {c.user_name || c.user_email}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(c.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-slate-700 whitespace-pre-wrap">{c.content}</p>
                        </div>
                      ))}
                    </div>

                    {/* Post Comment Input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handlePostComment(paper.id);
                        }}
                        placeholder="Add a comment or mention @username..."
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                      />
                      <button
                        type="button"
                        disabled={commentSubmitting || !commentInput.trim()}
                        onClick={() => handlePostComment(paper.id)}
                        className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50 cursor-pointer"
                      >
                        {commentSubmitting ? 'Posting…' : 'Send'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Paper Modal */}
      {editingPaper && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800">
                Edit Paper Metadata
              </h3>
              <button
                type="button"
                onClick={() => setEditingPaper(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Meaningful changes to title, abstract, or authors will automatically notify all users who have starred this paper.
            </p>

            {editError && (
              <div className="p-2.5 bg-red-50 text-red-800 border border-red-200 rounded-lg text-xs">
                {editError}
              </div>
            )}
            {editSuccess && (
              <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs">
                {editSuccess}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Authors (comma-separated)
                </label>
                <input
                  type="text"
                  required
                  value={editAuthors}
                  onChange={(e) => setEditAuthors(e.target.value)}
                  placeholder="e.g. Alice Smith, Bob Jones"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Abstract
                </label>
                <textarea
                  rows={4}
                  value={editAbstract}
                  onChange={(e) => setEditAbstract(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingPaper(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50 cursor-pointer"
                >
                  {editLoading ? 'Saving…' : 'Save & Notify Starrers'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
