import { Link } from 'react-router-dom';
import { Bookmark, ExternalLink, Calendar, HardDrive, ArrowUpRight } from 'lucide-react';
import { formatBytes, formatDate, formatAuthors } from '../../utils/formatters';
import { useLibrary } from '../../context/LibraryContext';

export default function PaperListItem({ paper }) {
  const { isBookmarked, toggleBookmark } = useLibrary();
  const saved = isBookmarked(paper.id);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl border border-white/[0.08] bg-[#1B1D2B] hover:border-violet-500/40 hover:bg-[#1E2132] hover:shadow-lg hover:shadow-violet-950/20 transition-all duration-200 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
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
            <span className="text-[10px] font-semibold text-[#A1A1B5] bg-[#23263A] border border-white/10 px-2 py-0.5 rounded-md">
              PDF
            </span>
          )}

          <span className="text-xs text-[#71758B] font-medium flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-[#71758B]" />
            {formatDate(paper.uploaded_at, { shortMonth: true })}
          </span>

          {paper.file_size_bytes && (
            <span className="text-xs text-[#71758B] font-medium flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-[#71758B]" />
              {formatBytes(paper.file_size_bytes)}
            </span>
          )}
        </div>

        <Link to={`/papers/${paper.id}`} className="block group-hover:text-violet-400 transition">
          <h3 className="text-sm sm:text-base font-bold text-[#F8FAFC] leading-snug truncate group-hover:text-violet-300 transition-colors">
            {paper.title}
          </h3>
        </Link>

        <p className="text-xs text-[#A1A1B5] font-medium mt-1 truncate">
          {formatAuthors(paper.authors, 4)}
        </p>

        {paper.abstract && (
          <p className="text-xs text-[#71758B] line-clamp-1 mt-1 font-normal">
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
              : 'bg-[#23263A] border-white/10 text-[#71758B] hover:text-[#F8FAFC] hover:border-white/20'
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
