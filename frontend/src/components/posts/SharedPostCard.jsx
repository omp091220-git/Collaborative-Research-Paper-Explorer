import { Link } from 'react-router-dom';
import { Share2, Lock, Globe, FileText, ExternalLink } from 'lucide-react';

export default function SharedPostCard({ post }) {
  if (!post) return null;

  // If the referenced post is private and user cannot access it
  if (post.is_private && !post.content && !post.title) {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-400">
          <Lock className="w-4 h-4 shrink-0" />
          <span>Referenced Private Post</span>
        </div>
        <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/70">
          This referenced post is private. You need explicit permission to view its contents.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 transition-all hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-indigo-800">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
          <Share2 className="w-3.5 h-3.5" />
          <span>Referenced Research Post</span>
        </div>
        <span className="flex items-center gap-1">
          {post.visibility === 'PRIVATE' ? (
            <Lock className="w-3 h-3 text-amber-500" />
          ) : (
            <Globe className="w-3 h-3 text-emerald-500" />
          )}
          <span>{post.visibility === 'PRIVATE' ? 'Private' : 'Public'}</span>
        </span>
      </div>

      <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
        {post.title}
      </h3>

      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        By {post.author_name || 'Scholar'} ·{' '}
        {post.created_at
          ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(post.created_at))
          : ''}
      </p>

      {post.content && (
        <p className="mt-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300 line-clamp-3 leading-relaxed">
          {post.content}
        </p>
      )}

      {post.tags?.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {post.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              #{tag}
            </span>
          ))}
          {post.tags.length > 3 && (
            <span className="text-[11px] text-slate-400">
              +{post.tags.length - 3} more
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2.5 dark:border-slate-800/80">
        {post.paper_id ? (
          <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 truncate max-w-[200px]">
            <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="truncate">{post.paper_title || 'Linked Paper'}</span>
          </span>
        ) : (
          <span />
        )}

        <Link
          to={`/share/posts/${post.share_token || post.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <span>View original</span>
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
