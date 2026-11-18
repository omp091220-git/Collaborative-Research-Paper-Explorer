import { useEffect, useState, useCallback } from 'react';
import { Sparkles, AlertTriangle, Check, X, Shield, Globe, RefreshCw } from 'lucide-react';
import {
  getTagSuggestions,
  generateTagSuggestions,
  acceptSuggestion,
  rejectSuggestion,
} from '../../services/tagSuggestions.service.js';
import Button from '../common/Button';
import Badge from '../common/Badge';

/**
 * UI for reviewing and managing AI-generated tag suggestions (FR-23 & FR-24).
 * - Generates suggestions for the given paper on demand.
 * - Displays duplicate or equivalence warnings when duplicate_check_status is flagged.
 * - Allows researchers/admins to accept as Private, request as Global, or reject.
 */
export default function TagSuggestionReview({
  paperId,
  paperTitle,
  canReview = false,
  onTagAccepted,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState(null);

  const fetchSuggestions = useCallback(async () => {
    if (!paperId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getTagSuggestions(paperId, 'PENDING');
      setSuggestions(data.suggestions || []);
    } catch (err) {
      console.error('Failed to load tag suggestions:', err);
      setError('Failed to load tag suggestions.');
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await generateTagSuggestions(paperId, paperTitle || '');
      await fetchSuggestions();
    } catch (err) {
      console.error('Failed to generate suggestions:', err);
      setError(err.response?.data?.error || 'Failed to generate tag suggestions.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAccept = async (id, visibility) => {
    setProcessingId(id);
    setError(null);
    try {
      await acceptSuggestion(id, visibility);
      await fetchSuggestions();
      if (onTagAccepted) onTagAccepted();
    } catch (err) {
      console.error('Failed to accept suggestion:', err);
      setError(err.response?.data?.error || 'Failed to accept suggestion.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id) => {
    setProcessingId(id);
    setError(null);
    try {
      await rejectSuggestion(id, 'User rejected suggestion');
      await fetchSuggestions();
    } catch (err) {
      console.error('Failed to reject suggestion:', err);
      setError(err.response?.data?.error || 'Failed to reject suggestion.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>AI Tag Suggestions (FR-23)</span>
            <Badge variant="purple" size="xs">
              {suggestions.length}
            </Badge>
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            AI-proposed research topic tags with semantic duplicate check &amp; privacy controls
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {canReview && (
            <Button
              variant="outline"
              size="sm"
              loading={generating}
              onClick={handleGenerate}
              iconLeft={Sparkles}
              className="gap-1.5 text-xs text-purple-700 border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30"
            >
              <span>{suggestions.length === 0 ? 'Generate Suggestions' : 'Re-generate'}</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={fetchSuggestions}
            disabled={loading}
            iconLeft={RefreshCw}
            className={`p-2 ${loading ? 'animate-spin' : ''}`}
            title="Refresh suggestions"
            aria-label="Refresh suggestions"
          />
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-200 font-semibold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
          <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
          <span>Loading tag suggestions...</span>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <p className="font-semibold text-slate-800 dark:text-slate-200">
            No pending AI tag suggestions.
          </p>
          <p>
            {canReview
              ? 'Click "Generate Suggestions" above to extract and suggest hierarchical tags from this paper.'
              : 'Suggestions can be reviewed and accepted by researchers or administrators.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => {
            const isProcessing = processingId === s.id;
            const isDuplicate = s.duplicate_check_status !== 'CLEAN';

            return (
              <div
                key={s.id}
                className={`p-3.5 rounded-xl border transition-all text-xs space-y-2.5 ${
                  isDuplicate
                    ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                    : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                      {s.suggested_name}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                      slug: {s.suggested_slug}
                    </span>
                    {s.confidence && (
                      <Badge variant="slate" size="xs">
                        {Math.round(Number(s.confidence) * 100)}% conf
                      </Badge>
                    )}
                  </div>

                  {canReview && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        variant="outline"
                        size="xs"
                        loading={isProcessing}
                        disabled={isProcessing}
                        onClick={() => handleAccept(s.id, 'PRIVATE')}
                        iconLeft={Shield}
                        className="gap-1 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                        title="Accept as private tag (only visible to you)"
                      >
                        Accept (Private)
                      </Button>

                      <Button
                        variant="primary"
                        size="xs"
                        loading={isProcessing}
                        disabled={isProcessing}
                        onClick={() => handleAccept(s.id, 'GLOBAL')}
                        iconLeft={Globe}
                        className="gap-1"
                        title="Propose as global tag for research taxonomy"
                      >
                        Accept (Global)
                      </Button>

                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={isProcessing}
                        onClick={() => handleReject(s.id)}
                        iconLeft={X}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Reject suggestion"
                        aria-label="Reject suggestion"
                      />
                    </div>
                  )}
                </div>

                {/* Duplicate / Equivalence Warning */}
                {isDuplicate && (
                  <div className="flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-300 font-medium bg-amber-100/70 dark:bg-amber-900/30 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Duplicate Detected:</strong> Semantically equivalent or matching tag exists in taxonomy.
                      {s.reasoning && ` (${s.reasoning})`} Review carefully before approving.
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
