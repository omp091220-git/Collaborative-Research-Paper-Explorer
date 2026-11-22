import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Globe,
  Lock,
  FileText,
  Share2,
  ShieldAlert,
  LogIn,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import postSharingService from '../../services/postSharing.service';
import { getApiErrorMessage } from '../../services/api';
import SharedPostCard from '../../components/posts/SharedPostCard';
import SharePostModal from '../../components/posts/SharePostModal';

export default function SharedPostPage() {
  const { token } = useParams();
  const { user } = useAuth();

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPrivateAccessDenied, setIsPrivateAccessDenied] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);
    setIsPrivateAccessDenied(false);

    postSharingService
      .resolveShareLink(token, controller.signal)
      .then((data) => {
        if (active) {
          setPost(data);
        }
      })
      .catch((err) => {
        if (active) {
          if (err.response?.status === 403 || err.response?.data?.is_private) {
            setIsPrivateAccessDenied(true);
          } else if (err.response?.status === 404) {
            setError('This shared post was not found or the link has expired.');
          } else {
            setError(getApiErrorMessage(err, 'Failed to resolve shared post.'));
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [token]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Top navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/feed"
          className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to public feed</span>
        </Link>

        {post && (
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-12 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="mt-3 text-sm font-medium">Resolving shared post…</p>
        </div>
      )}

      {/* SECURE ACCESS DENIED STATE (Zero metadata leaked) */}
      {!loading && isPrivateAccessDenied && (
        <div className="rounded-2xl border border-amber-200 bg-white p-8 shadow-sm dark:border-amber-900/50 dark:bg-slate-900 text-center space-y-4">
          <div className="mx-auto flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            This Post is Private
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            The author has restricted access to this research post. To view it, you must be signed in with an authorized account granted read or write permissions.
          </p>

          <div className="pt-4 flex flex-wrap justify-center gap-3">
            {!user ? (
              <Link
                to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign in to access</span>
              </Link>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <ShieldAlert className="w-4 h-4" />
                <span>Signed in as {user.email} (No access granted)</span>
              </div>
            )}
            <Link
              to="/feed"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <span>Explore Public Posts</span>
            </Link>
          </div>
        </div>
      )}

      {/* Generic Error / Not Found state */}
      {!loading && !isPrivateAccessDenied && error && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Post Unavailable
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {error}
          </p>
          <Link
            to="/feed"
            className="inline-block mt-4 text-sm font-semibold text-indigo-600 dark:text-indigo-400"
          >
            Return to public feed
          </Link>
        </div>
      )}

      {/* RESOLVED POST CONTENT */}
      {!loading && !isPrivateAccessDenied && post && (
        <article className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          {/* Visibility & Metadata */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
              {post.visibility === 'PRIVATE' ? (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Private Post</span>
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Public Research Post</span>
                </>
              )}
            </span>

            {post.share_count > 0 && (
              <span className="text-xs text-slate-400">
                Shared {post.share_count} {post.share_count === 1 ? 'time' : 'times'}
              </span>
            )}
          </div>

          <h1 className="mt-4 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 break-words">
            {post.title}
          </h1>

          <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            By <strong className="text-slate-700 dark:text-slate-300">{post.author_name || 'Scholar'}</strong> ·{' '}
            {post.created_at
              ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(post.created_at))
              : ''}
          </p>

          <div className="mt-6 text-sm sm:text-base leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">
            {post.content}
          </div>

          {/* Embedded referenced post if this was an in-platform share */}
          {post.referenced_post && (
            <SharedPostCard post={post.referenced_post} />
          )}

          {/* Topic tags */}
          {post.tags?.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  to={`/feed?tag=${encodeURIComponent(tag)}`}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          {/* Linked paper */}
          {post.paper_id && (
            <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Link
                to={user ? `/papers/${post.paper_id}` : '/login'}
                className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span>
                  {user ? 'Read linked paper' : 'Sign in to read linked paper'}:{' '}
                  {post.paper_title || 'Research paper'}
                </span>
              </Link>
            </div>
          )}
        </article>
      )}

      {/* Share Modal */}
      {post && (
        <SharePostModal
          post={post}
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          onShareSuccess={(_newPost) => {
            // Updated share count
            setPost((prev) =>
              prev ? { ...prev, share_count: (prev.share_count || 0) + 1 } : prev
            );
          }}
        />
      )}
    </div>
  );
}
