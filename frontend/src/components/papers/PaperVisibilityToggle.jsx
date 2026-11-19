import { useState } from 'react';
import { Globe, Lock, Loader2, AlertTriangle } from 'lucide-react';
import papersService from '../../services/papers.service';

export default function PaperVisibilityToggle({
  paperId,
  initialVisibility = 'PUBLIC',
  canManage = false,
  onVisibilityChange,
  className = '',
}) {
  const [visibility, setVisibility] = useState(initialVisibility);
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [error, setError] = useState(null);

  const isPublic = visibility === 'PUBLIC';

  const handleToggleClick = () => {
    if (!canManage || loading) return;
    setError(null);
    if (isPublic) {
      // Switching to PRIVATE requires confirmation
      setShowConfirmModal(true);
    } else {
      // Switching to PUBLIC can be done directly
      performUpdate('PUBLIC');
    }
  };

  const performUpdate = async (targetVisibility) => {
    setLoading(true);
    setError(null);
    try {
      await papersService.updateVisibility(paperId, targetVisibility);
      setVisibility(targetVisibility);
      setShowConfirmModal(false);
      if (onVisibilityChange) {
        onVisibilityChange(targetVisibility);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update paper visibility.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Visibility Badge & Interactive Toggle Button */}
      {canManage ? (
        <button
          type="button"
          onClick={handleToggleClick}
          disabled={loading}
          title={
            isPublic
              ? 'Click to change visibility to PRIVATE'
              : 'Click to change visibility to PUBLIC'
          }
          className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all shadow-xs cursor-pointer ${
            isPublic
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25'
          } ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isPublic ? (
            <Globe className="w-3.5 h-3.5" />
          ) : (
            <Lock className="w-3.5 h-3.5" />
          )}
          <span>{isPublic ? 'PUBLIC' : 'PRIVATE'}</span>
          <span className="text-[10px] opacity-60 underline ml-0.5 group-hover:opacity-100">
            (Change)
          </span>
        </button>
      ) : (
        <span
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shadow-xs ${
            isPublic
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
          }`}
        >
          {isPublic ? (
            <Globe className="w-3.5 h-3.5" />
          ) : (
            <Lock className="w-3.5 h-3.5" />
          )}
          <span>{isPublic ? 'PUBLIC' : 'PRIVATE'}</span>
        </span>
      )}

      {error && (
        <span className="text-xs text-rose-500 ml-2" title={error}>
          {error}
        </span>
      )}

      {/* Confirmation Modal for Switching to PRIVATE */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-theme-card rounded-2xl shadow-2xl border border-theme-subtle w-full max-w-md p-6 overflow-hidden">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-theme-main">
                  Make Paper Private?
                </h3>
                <p className="text-xs text-theme-muted mt-2 leading-relaxed">
                  Switching this paper to <strong className="text-amber-400">PRIVATE</strong> will
                  immediately restrict access.
                </p>
                <ul className="text-xs text-theme-muted mt-2 space-y-1 list-disc list-inside">
                  <li>Only you, platform administrators, and approved collaborators will be able to search, view, or open the PDF.</li>
                  <li>Existing active collaborators will retain their assigned permissions.</li>
                  <li>Unauthorized platform users will receive a 403 Restricted response.</li>
                </ul>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-lg">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={loading}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-theme-elevated hover:bg-theme-subtle text-theme-secondary transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => performUpdate('PRIVATE')}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition shadow-sm cursor-pointer"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Make Private
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
