import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Globe, FileText, Share2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import feedService from '../../services/publicFeed.service';
import { getApiErrorMessage } from '../../services/api';
import ErrorState from '../../components/common/ErrorState';
import SharedPostCard from '../../components/posts/SharedPostCard';
import SharePostModal from '../../components/posts/SharePostModal';

export default function PublicPostPage() {
  const { postId } = useParams(),
    { user } = useAuth();
  const [result, setResult] = useState(null),
    [reload, setReload] = useState(0);
  const [isShareOpen, setIsShareOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    feedService
      .detail(postId, controller.signal)
      .then((post) => {
        if (active) setResult({ id: postId, reload, post });
      })
      .catch((error) => {
        if (active)
          setResult({
            id: postId,
            reload,
            error:
              error.response?.status === 404
                ? 'This post is no longer public or is unavailable.'
                : getApiErrorMessage(error, 'Could not load this public post.'),
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [postId, reload]);

  const current =
    result?.id === postId && result?.reload === reload ? result : null;
  const post = current?.post;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <Link
          to="/feed"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to public feed
        </Link>
        {post && (
          <button
            type="button"
            onClick={() => setIsShareOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>Share</span>
          </button>
        )}
      </div>

      {!current && (
        <p role="status" className="p-8 text-slate-700 dark:text-slate-200">
          Loading public post…
        </p>
      )}

      {current?.error && (
        <ErrorState
          title="Public post unavailable"
          message={current.error}
          onRetry={() => setReload((n) => n + 1)}
        />
      )}

      {post && (
        <article className="rounded-2xl border border-slate-300 bg-white p-5 sm:p-8 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
              <Globe className="w-4 h-4" />
              Public post
            </div>
            {post.share_count > 0 && (
              <span className="text-xs text-slate-400">
                {post.share_count} {post.share_count === 1 ? 'share' : 'shares'}
              </span>
            )}
          </div>

          <h1 className="mt-4 text-2xl sm:text-3xl font-bold break-words text-slate-900 dark:text-slate-100">
            {post.title}
          </h1>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 break-words">
            {post.author_name || 'Scholar'} ·{' '}
            <time dateTime={post.created_at}>
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: 'medium',
              }).format(new Date(post.created_at))}
            </time>
          </p>

          <div className="mt-6 whitespace-pre-wrap break-words text-sm sm:text-base leading-relaxed text-slate-800 dark:text-slate-200">
            {post.content}
          </div>

          {/* Referenced post card if this post is an in-platform share */}
          {post.referenced_post && (
            <SharedPostCard post={post.referenced_post} />
          )}

          {post.tags?.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  to={`/feed?tag=${encodeURIComponent(tag)}`}
                  className="max-w-full break-words rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          {post.paper_id && (
            <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
              <Link
                to={user ? `/papers/${post.paper_id}` : '/login'}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300"
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span className="break-words">
                  {user ? 'Read linked paper' : 'Sign in to read linked paper'}:{' '}
                  {post.paper_title || 'Research paper'}
                </span>
              </Link>
            </div>
          )}

          {/* Bottom Share Action */}
          <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={() => setIsShareOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 dark:text-indigo-300 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Share Research Post</span>
            </button>
          </div>
        </article>
      )}

      {post && (
        <SharePostModal
          post={post}
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          onShareSuccess={() => setReload((n) => n + 1)}
        />
      )}
    </div>
  );
}
