import { Link } from 'react-router-dom';
import { Bookmark, ExternalLink, Calendar, HardDrive, ArrowUpRight, Globe, Lock, User, Users } from 'lucide-react';
import { formatBytes, formatDate, formatAuthors } from '../../utils/formatters';
import { useLibrary } from '../../context/LibraryContext';

export default function PaperListItem({ paper }) {
  const { isBookmarked, toggleBookmark } = useLibrary();
  const saved = isBookmarked(paper.id);
  const isPrivate = paper.visibility === 'PRIVATE';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl border border-theme-subtle bg-theme-card hover:border-violet-500/40 hover:bg-theme-elevated hover:shadow-lg hover:shadow-violet-950/20 transition-all duration-200 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {/* Visibility badge */}
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border shadow-2xs ${
              isPrivate
                ? 'bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
            }`}
          >
            {isPrivate ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
            <span>{isPrivate ? 'PRIVATE' : 'PUBLIC'}</span>
          </span>

          {paper.arxiv_id ? (
            <a
              href={`https://arxiv.org/abs/${paper.arxiv_id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition font-semibold"
            >
              <span>arXiv:{paper.arxiv_id}</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          ) : (
            <span className="text-[10px] font-semibold text-theme-secondary bg-theme-elevated border border-white/10 px-2 py-0.5 rounded-md">
              PDF
            </span>
          )}

          {/* Owner info */}
          <span className="text-xs text-theme-secondary font-medium flex items-center gap-1">
            <User className="w-3 h-3 text-violet-400" />
            <span>{paper.owner_name || 'Dr. Shyam Ramani'}</span>
          </span>

          <span className="text-xs text-theme-muted font-medium flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-theme-muted" />
            {formatDate(paper.uploaded_at, { shortMonth: true })}
          </span>

          {paper.collaborator_count !== undefined && (
            <span className="text-xs text-theme-muted font-medium flex items-center gap-1">
              <Users className="w-3 h-3 text-theme-muted" />
              <span>{paper.collaborator_count}</span>
            </span>
          )}

          {paper.file_size_bytes && (
            <span className="text-xs text-theme-muted font-medium flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-theme-muted" />
              {formatBytes(paper.file_size_bytes)}
            </span>
          )}
        </div>

        <Link to={`/papers/${paper.id}`} className="block group-hover:text-violet-400 transition">
          <h3 className="text-sm sm:text-base font-bold text-theme-main leading-snug truncate group-hover:text-violet-300 transition-colors">
            {paper.title}
          </h3>
        </Link>

        <p className="text-xs text-theme-secondary font-medium mt-1 truncate">
          {formatAuthors(paper.authors, 4)}
        </p>

        {paper.abstract && (
          <p className="text-xs text-theme-muted line-clamp-1 mt-1 font-normal">
            {paper.abstract}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
        <button
          type="button"
          onClick={() => toggleBookmark(paper)}
          className={`p-2 rounded-xl border transition cursor-pointer ${
            saved
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-xs'
              : 'bg-theme-elevated border-white/10 text-theme-muted hover:text-theme-main hover:border-white/20'
          }`}
          title={saved ? 'Remove from saved' : 'Save to library'}
          aria-label={saved ? 'Remove from saved' : 'Save to library'}
        >
          <Bookmark className={`w-4 h-4 ${saved ? 'fill-amber-400 text-amber-400' : ''}`} />
        </button>

        <Link
          to={`/papers/${paper.id}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition shadow-sm shadow-violet-600/25 group/link"
        >
          <span>Read Paper</span>
          <ArrowUpRight className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
