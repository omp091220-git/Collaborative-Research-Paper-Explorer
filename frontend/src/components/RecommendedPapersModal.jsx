import { useState, useEffect } from 'react';
import axios from 'axios';
import Button from './common/Button';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-theme-card rounded-2xl shadow-2xl border border-theme-subtle w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-theme-subtle flex items-start justify-between bg-theme-elevated">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">✨</span>
              <h3 className="font-bold text-theme-main text-lg">
                Related Literature Recommendations (FR-14)
              </h3>
            </div>
            <p className="text-xs text-theme-muted mt-1 line-clamp-1">
              For: <span className="font-medium text-theme-secondary">{paper.title}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-theme-muted hover:text-theme-main hover:bg-theme-card transition cursor-pointer text-sm font-bold"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Info Banner */}
          <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl text-xs text-violet-300 flex items-center justify-between">
            <span>
              💡 <strong>AI Hybrid Ranking:</strong> Scored via section-level hierarchical topic tags + vector text embeddings.
            </span>
            <Button
              variant="outline"
              size="xs"
              onClick={handleSeedSample}
              disabled={seeding}
              className="shrink-0 ml-2"
              title="Add sample papers to test recommendations"
            >
              {seeding ? 'Seeding…' : 'Seed Sample Papers'}
            </Button>
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-theme-muted gap-2">
              <span className="inline-block w-6 h-6 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
              <p className="text-xs font-medium">Computing AI recommendations…</p>
            </div>
          )}

          {!loading && error && (
            <div className="p-3 bg-rose-500/10 text-rose-300 border border-rose-500/30 rounded-xl text-xs">
              {error}
            </div>
          )}

          {!loading && !error && recommendations.length === 0 && (
            <div className="text-center py-12 text-theme-muted space-y-3">
              <p className="text-sm font-medium text-theme-secondary">
                No related literature found in the database yet.
              </p>
              <p className="text-xs text-theme-muted max-w-sm mx-auto">
                Click <strong>"Seed Sample Papers"</strong> above to populate sample academic literature across Computer Science, AI, and Renewable Energy!
              </p>
            </div>
          )}

          {!loading && !error && recommendations.length > 0 && (
            <div className="space-y-3">
              {recommendations.map((rec, index) => (
                <div
                  key={rec.id}
                  className="p-4 border border-theme-subtle rounded-xl bg-theme-elevated hover:bg-theme-card hover:shadow-xs transition duration-150 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/20 text-violet-300 text-xs font-bold shrink-0">
                        #{index + 1}
                      </span>
                      <h4 className="font-semibold text-theme-main text-sm leading-snug">
                        {rec.title}
                      </h4>
                    </div>

                    {/* Match Score Badge */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-2xs">
                        {rec.matchPercentage}% Match
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-theme-muted">
                    {rec.authors?.join(', ')}
                  </p>

                  {/* AI Explanation & Match Breakdown */}
                  <div className="pt-1 text-xs text-theme-secondary flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 bg-theme-card text-theme-secondary rounded border border-theme-subtle text-[10px] font-medium">
                      Tags: {rec.scoreBreakdown?.tagSimilarity}%
                    </span>
                    <span className="px-2 py-0.5 bg-theme-card text-theme-secondary rounded border border-theme-subtle text-[10px] font-medium">
                      Semantic AI: {rec.scoreBreakdown?.semanticSimilarity}%
                    </span>
                    {rec.topMatchingSection && (
                      <span className="text-[10px] text-violet-400 font-medium">
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
                          className="px-2 py-0.5 bg-violet-500/10 text-violet-300 border border-violet-500/20 rounded-full text-[10px] font-medium"
                        >
                          🏷️ {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {rec.explanation && (
                    <p className="text-[10px] text-theme-muted italic pt-0.5">
                      {rec.explanation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-theme-subtle flex justify-end bg-theme-elevated">
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
