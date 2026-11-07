import { Link } from 'react-router-dom';
import { Bookmark, ExternalLink, Calendar, HardDrive, ArrowUpRight } from 'lucide-react';
import { formatBytes, formatDate, formatAuthors } from '../../utils/formatters';
import { useLibrary } from '../../context/LibraryContext';

export default function PaperListItem({ paper }) {
  const { isBookmarked, toggleBookmark } = useLibrary();
  const saved = isBookmarked(paper.id);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-2xs transition group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          {paper.arxiv_id ? (
            <a
              href={`https://arxiv.org/abs/${paper.arxiv_id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition"
            >
              <span>arXiv:{paper.arxiv_id}</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          ) : (
            <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
              PDF
            </span>
          )}

          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(paper.uploaded_at, { shortMonth: true })}
          </span>

          {paper.file_size_bytes && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              {formatBytes(paper.file_size_bytes)}
            </span>
          )}
        </div>

        <Link to={`/papers/${paper.id}`} className="block group-hover:text-indigo-600 transition">
          <h3 className="text-sm font-semibold text-slate-900 leading-snug truncate">
            {paper.title}
          </h3>
        </Link>

        <p className="text-xs text-slate-500 font-medium mt-1 truncate">
          {formatAuthors(paper.authors, 4)}
        </p>

        {paper.abstract && (
          <p className="text-xs text-slate-600 line-clamp-1 mt-1 font-normal">
            {paper.abstract}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <button
          type="button"
          onClick={() => toggleBookmark(paper)}
          className={`p-2 rounded-lg border transition cursor-pointer ${
            saved
              ? 'bg-amber-50 border-amber-300 text-amber-600'
              : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300'
          }`}
          title={saved ? 'Remove from saved' : 'Save to library'}
          aria-label={saved ? 'Remove from saved' : 'Save to library'}
        >
          <Bookmark className={`w-4 h-4 ${saved ? 'fill-amber-500' : ''}`} />
        </button>

        <Link
          to={`/papers/${paper.id}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-indigo-600 border border-slate-200 text-xs font-semibold transition"
        >
          <span>View</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
