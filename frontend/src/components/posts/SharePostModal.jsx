import { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  Lock,
  Globe,
  Loader2,
  AlertCircle,
  MessageSquareShare,
} from 'lucide-react';
import postSharingService from '../../services/postSharing.service';
import { getApiErrorMessage } from '../../services/api';

export default function SharePostModal({ post, isOpen, onClose, onShareSuccess }) {
  const [activeTab, setActiveTab] = useState('link'); // 'link' | 'platform'
  const [loadingLink, setLoadingLink] = useState(false);
  const [shareData, setShareData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // Platform share form state
  const [commentary, setCommentary] = useState('');
  const [visibility, setVisibility] = useState('PUBLIC');
  const [submitting, setSubmitting] = useState(false);
  const [platformSuccess, setPlatformSuccess] = useState('');

  const isPrivate =
    post?.visibility === 'PRIVATE' || post?.author_account_type === 'PRIVATE';

  useEffect(() => {
    if (!isOpen || !post?.id) return;

    setError('');
    setCopied(false);
    setPlatformSuccess('');
    setCommentary('');
    // If the original post is private, platform share must default to PRIVATE
    setVisibility(isPrivate ? 'PRIVATE' : 'PUBLIC');

    // Fetch or generate share link
    let active = true;
    setLoadingLink(true);

    postSharingService
      .getShareLink(post.id)
      .then((data) => {
        if (active) setShareData(data);
      })
      .catch((err) => {
        if (active) setError(getApiErrorMessage(err, 'Failed to generate share link.'));
      })
      .finally(() => {
        if (active) setLoadingLink(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, post?.id, isPrivate]);

  if (!isOpen || !post) return null;

  const shareUrl = shareData?.share_token
    ? `${window.location.origin}/share/posts/${shareData.share_token}`
    : `${window.location.origin}/posts/${post.id}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not copy link to clipboard automatically. Please copy manually.');
    }
  };

  const handlePlatformShare = async (e) => {
    e.preventDefault();
    if (!commentary.trim()) {
      setError('Please enter your commentary before sharing.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const result = await postSharingService.shareToPlatform(post.id, {
        commentary: commentary.trim(),
        visibility: isPrivate ? 'PRIVATE' : visibility,
      });
      setPlatformSuccess('Post shared successfully on ScholarSphere!');
      if (onShareSuccess) {
        onShareSuccess(result);
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to share post to ScholarSphere.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Share Research Post
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                {isPrivate ? (
                  <>
                    <Lock className="w-3 h-3 text-amber-500" />
                    <span>Private post</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-3 h-3 text-emerald-500" />
                    <span>Public post</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            aria-label="Close share dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex mt-4 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
              activeTab === 'link'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Shareable Link
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('platform')}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
              activeTab === 'platform'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Share to ScholarSphere
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {platformSuccess && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{platformSuccess}</span>
          </div>
        )}

        {/* TAB 1: Shareable Link */}
        {activeTab === 'link' && (
          <div className="mt-5 space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Copy this link to share the post reference. Access to the post content is strictly verified on link resolution.
            </p>

            {loadingLink ? (
              <div className="flex items-center justify-center py-6 text-slate-500 gap-2 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Generating secure share link…</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    copied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Privacy callout */}
            <div
              className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                isPrivate
                  ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200'
                  : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300'
              }`}
            >
              {isPrivate ? (
                <div className="flex items-start gap-2">
                  <Lock className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <strong className="font-semibold">Privacy Boundary Enforced:</strong>{' '}
                    This is a private post. Only users explicitly granted permission can access its content. Unauthorized or unauthenticated visitors resolving this link will receive an access-denied screen with zero leaked details.
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <Globe className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <strong className="font-semibold">Public Post:</strong> Anyone with this link can view the post, title, and content.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: In-Platform Share */}
        {activeTab === 'platform' && (
          <form onSubmit={handlePlatformShare} className="mt-5 space-y-4">
            <div>
              <label className="block mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Add your thoughts or commentary
              </label>
              <textarea
                value={commentary}
                onChange={(e) => setCommentary(e.target.value)}
                placeholder="What do you think about this research? Add key takeaways or questions..."
                rows={3}
                required
                maxLength={5000}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Preview of referenced post */}
            <div className="rounded-xl border border-slate-200 p-3 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40">
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                Referenced Post
              </span>
              <p className="mt-1 text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                {post.title}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                By {post.author_name || 'Scholar'}
              </p>
            </div>

            {/* Visibility choice */}
            <div>
              <label className="block mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Post Visibility
              </label>
              {isPrivate ? (
                <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Locked to <strong>PRIVATE</strong>: In-platform shares referencing private research cannot be published publicly.
                  </span>
                </div>
              ) : (
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="PUBLIC">Public — visible in community feed and search</option>
                  <option value="PRIVATE">Private — visible only to you and invited collaborators</option>
                </select>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sharing…</span>
                  </>
                ) : (
                  <>
                    <MessageSquareShare className="w-3.5 h-3.5" />
                    <span>Share to ScholarSphere</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
