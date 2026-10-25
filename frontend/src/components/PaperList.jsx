import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import PaperSummary from './PaperSummary.jsx';

export default function PaperList({ refreshTrigger }) {
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

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

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers, refreshTrigger]);

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
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
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
        <div className="space-y-3">
          {filtered.map((paper) => (
            <div
              key={paper.id}
              className="p-4 border border-slate-200 rounded-xl bg-slate-50/40 hover:bg-slate-50 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3
                    className="font-semibold text-slate-800 text-sm leading-snug truncate"
                    title={paper.title}
                  >
                    {paper.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {paper.authors?.join(', ')}
                  </p>
                  {paper.abstract && (
                    <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">
                      {paper.abstract}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
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
                  <span className="text-xs text-slate-400">
                    {paper.file_size_bytes
                      ? `${(paper.file_size_bytes / 1_048_576).toFixed(1)} MB`
                      : ''}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Added{' '}
                {new Date(paper.uploaded_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
              <PaperSummary paperId={paper.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
