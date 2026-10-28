import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import CollaboratorsModal from './CollaboratorsModal';
import DiscussionPanel from './DiscussionPanel';
import CitationGraph from './CitationGraph';
import RecommendedPapersModal from './RecommendedPapersModal';

export default function PaperList({ refreshTrigger }) {
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedPaperForRecs, setSelectedPaperForRecs] = useState(null);
  const [seeding, setSeeding] = useState(false);

  // Modals state
  const [selectedCollabPaper, setSelectedCollabPaper] = useState(null);
  const [selectedDiscussionPaper, setSelectedDiscussionPaper] = useState(null);
  const [selectedCitationPaper, setSelectedCitationPaper] = useState(null);

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
    let ignore = false;
    const load = async () => {
      try {
        const res = await axios.get('/api/papers', { withCredentials: true });
        if (!ignore) {
          setPapers(res.data.papers || []);
          setError(null);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.response?.data?.error || 'Failed to load papers.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [refreshTrigger]);

  const handleSeedSamplePapers = async () => {
    setSeeding(true);
    try {
      await axios.post('/api/recommendations/seed-sample', {}, { withCredentials: true });
      await fetchPapers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to seed sample papers.');
    } finally {
      setSeeding(false);
    }
  };

  const filtered = papers.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.title?.toLowerCase().includes(q) ||
      p.abstract?.toLowerCase().includes(q) ||
      p.authors?.some((a) => a.toLowerCase().includes(q)) ||
      p.arxiv_id?.toLowerCase().includes(q) ||
      p.doi?.toLowerCase().includes(q) ||
      String(p.publication_year || '').includes(q)
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
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search papers…"
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-slate-800 placeholder-slate-400 w-48"
          />
          <button
            onClick={fetchPapers}
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-medium transition cursor-pointer"
            title="Refresh"
          >
            ↺
          </button>
          <button
            onClick={handleSeedSamplePapers}
            disabled={seeding}
            className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs transition cursor-pointer"
            title="Seed sample papers with section tags and embeddings"
          >
            {seeding ? 'Seeding…' : '✨ Seed Sample Papers (FR-14 Demo)'}
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

      {/* Empty State when database has 0 papers */}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
          <span className="text-3xl">📚</span>
          <p className="text-slate-700 font-semibold text-sm">
            No papers in database yet!
          </p>
          <p className="text-slate-500 text-xs max-w-md mx-auto">
            Click below to populate realistic academic papers with sections, hierarchical tags, and embeddings to test FR-14 literature recommendations.
          </p>
          <button
            onClick={handleSeedSamplePapers}
            disabled={seeding}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
          >
            {seeding ? 'Seeding Papers…' : '✨ Populate Sample Research Papers'}
          </button>
        </div>
      )}

      {/* List of Papers */}
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
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {paper.publication_year && (
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded font-medium">
                        {paper.publication_year}
                      </span>
                    )}
                    {paper.doi && (
                      <a
                        href={`https://doi.org/${paper.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-medium hover:bg-blue-100 transition"
                        title={`DOI: ${paper.doi}`}
                      >
                        DOI:{paper.doi}
                      </a>
                    )}
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
                  <span className="text-xs text-slate-400">
                    {paper.file_size_bytes
                      ? `${(paper.file_size_bytes / 1_048_576).toFixed(1)} MB`
                      : ''}
                  </span>
                </div>
              </div>

              {/* Bottom Card Controls: Date + Discussion & Collaborator Buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-200/70">
              {/* Bottom Card Actions */}
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-200/60">
                <p className="text-xs text-slate-400">
                  Added{' '}
                  {new Date(paper.uploaded_at).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedCitationPaper(paper)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-teal-50 text-teal-700 border border-teal-200 rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs"
                    title="Explore backward references, forward citations, and clusters"
                  >
                    <span>🕸️</span>
                    <span>Citation Graph</span>
                  </button>

                  <button
                    onClick={() => setSelectedDiscussionPaper(paper)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs"
                  >
                    <span>💬</span>
                    <span>Discussions</span>
                  </button>

                  <button
                    onClick={() => setSelectedCollabPaper(paper)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-purple-50 text-purple-600 border border-purple-200 rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs"
                  >
                    <span>👥</span>
                    <span>Collaborators</span>
                  </button>
                </div>
                {/* FR-14: Suggest Related Literature Trigger */}
                <button
                  type="button"
                  onClick={() => setSelectedPaperForRecs(paper)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold shadow-2xs transition cursor-pointer"
                  title="View AI literature recommendations"
                >
                  <span>✨</span> Related Papers (FR-14)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Collaborators Modal */}
      <CollaboratorsModal
        paper={selectedCollabPaper}
        isOpen={Boolean(selectedCollabPaper)}
        onClose={() => setSelectedCollabPaper(null)}
      />

      {/* Discussion Panel Drawer */}
      <DiscussionPanel
        paper={selectedDiscussionPaper}
        isOpen={Boolean(selectedDiscussionPaper)}
        onClose={() => setSelectedDiscussionPaper(null)}
      />

      {/* FR-16: Citation Graph Explorer Modal */}
      {selectedCitationPaper && (
        <CitationGraph
          paperId={selectedCitationPaper.id}
          initialPaper={selectedCitationPaper}
          onClose={() => setSelectedCitationPaper(null)}
        />
      )}
      {/* FR-14 Recommendation Modal */}
      <RecommendedPapersModal
        paper={selectedPaperForRecs}
        onClose={() => setSelectedPaperForRecs(null)}
        onRefreshPapers={fetchPapers}
      />
    </div>
  );
}
