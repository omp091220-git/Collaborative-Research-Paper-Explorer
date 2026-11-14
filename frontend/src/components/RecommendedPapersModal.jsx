import { useState, useEffect } from 'react';
import axios from 'axios';

export default function RecommendedPapersModal({ paper, onClose, onRefreshPapers }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (!paper) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchRecs = async () => {
      try {
        const res = await axios.get(`/api/recommendations/papers/${paper.id}`, {
          withCredentials: true,
        });
        if (isMounted) {
          setRecommendations(res.data.recommendations || []);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err.response?.data?.error || 'Failed to load recommendations.'
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchRecs();

    return () => {
      isMounted = false;
    };
  }, [paper]);

  const handleSeedSample = async () => {
    setSeeding(true);
    try {
      await axios.post(
        '/api/recommendations/seed-sample',
        {},
        { withCredentials: true }
      );
      if (onRefreshPapers) onRefreshPapers();
      // Re-fetch recommendations for this paper
      const res = await axios.get(`/api/recommendations/papers/${paper.id}`, {
        withCredentials: true,
      });
      setRecommendations(res.data.recommendations || []);
    } catch (err) {
      setError(
        err.response?.data?.error || 'Failed to seed sample papers.'
      );
    } finally {
      setSeeding(false);
    }
  };

  if (!paper) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">✨</span>
              <h3 className="font-bold text-slate-800 text-lg">
                Related Literature Recommendations (FR-14)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1 line-clamp-1">
              For: <span className="font-medium text-slate-700">{paper.title}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer text-sm font-bold"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Info Banner */}
          <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-center justify-between">
            <span>
              💡 <strong>AI Hybrid Ranking:</strong> Scored via section-level hierarchical topic tags + vector text embeddings.
            </span>
            <button
              onClick={handleSeedSample}
              disabled={seeding}
              className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-xs font-semibold shadow-2xs transition cursor-pointer shrink-0 ml-2"
              title="Add sample papers to test recommendations"
            >
              {seeding ? 'Seeding…' : 'Seed Sample Papers'}
            </button>
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <span className="inline-block w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-xs font-medium">Computing AI recommendations…</p>
            </div>
          )}

          {!loading && error && (
            <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs">
              {error}
            </div>
          )}

          {!loading && !error && recommendations.length === 0 && (
            <div className="text-center py-12 text-slate-500 space-y-3">
              <p className="text-sm font-medium">
                No related literature found in the database yet.
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Click <strong>"Seed Sample Papers"</strong> above to populate sample academic literature across Computer Science, AI, and Renewable Energy!
              </p>
            </div>
          )}

          {!loading && !error && recommendations.length > 0 && (
            <div className="space-y-3">
              {recommendations.map((rec, index) => (
                <div
                  key={rec.id}
                  className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 hover:bg-white hover:shadow-xs transition duration-150 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold shrink-0">
                        #{index + 1}
                      </span>
                      <h4 className="font-semibold text-slate-800 text-sm leading-snug">
                        {rec.title}
                      </h4>
                    </div>

                    {/* Match Score Badge */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                        {rec.matchPercentage}% Match
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500">
                    {rec.authors?.join(', ')}
                  </p>

                  {/* AI Explanation & Match Breakdown */}
                  <div className="pt-1 text-xs text-slate-600 flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200 text-2xs font-medium">
                      Tags: {rec.scoreBreakdown?.tagSimilarity}%
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200 text-2xs font-medium">
                      Semantic AI: {rec.scoreBreakdown?.semanticSimilarity}%
                    </span>
                    {rec.topMatchingSection && (
                      <span className="text-2xs text-indigo-600 font-medium">
                        Aligned: {rec.topMatchingSection}
                      </span>
                    )}
                  </div>

                  {/* Matched Tags */}
                  {rec.matchedTags && rec.matchedTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {rec.matchedTags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-2xs font-medium"
                        >
                          🏷️ {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {rec.explanation && (
                    <p className="text-2xs text-slate-500 italic pt-0.5">
                      {rec.explanation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50/50">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
