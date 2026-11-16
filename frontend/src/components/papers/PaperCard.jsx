import { Link } from 'react-router-dom';
import { Bookmark, FileText, ExternalLink, Calendar, HardDrive, ArrowUpRight, Sparkles } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import { formatBytes, formatDate, formatAuthors } from '../../utils/formatters';
import { useLibrary } from '../../context/LibraryContext';

export default function PaperCard({ paper, onOpenSummary }) {
  const { isBookmarked, toggleBookmark } = useLibrary();
  const saved = isBookmarked(paper.id);

  return (
    <Card
      hoverable
      className="flex flex-col h-full group bg-[#1B1D2B] border border-white/[0.08] shadow-sm hover:border-violet-500/40 hover:shadow-xl hover:shadow-violet-950/20 transition-all duration-200"
    >
      <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between">
        <div>
          {/* Header row: arXiv badge & actions */}
          <div className="flex items-center justify-between gap-2 mb-3.5">
            <div className="flex items-center gap-2">
              {paper.arxiv_id ? (
                <a
                  href={`https://arxiv.org/abs/${paper.arxiv_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition font-semibold"
                  title="View on arXiv"
                >
                  <span>arXiv:{paper.arxiv_id}</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              ) : (
                <Badge variant="default" size="xs">
                  <FileText className="w-3 h-3 text-violet-400" />
                  <span>PDF Document</span>
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {onOpenSummary && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenSummary(paper);
                  }}
                  className="p-1.5 rounded-xl border border-white/10 bg-[#23263A] text-violet-300 hover:text-white hover:border-violet-500/40 transition cursor-pointer"
                  title="Generate AI Summary"
                  aria-label="Generate AI Summary"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleBookmark(paper);
                }}
                className={`p-1.5 rounded-xl border transition cursor-pointer ${
                  saved
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-xs'
                    : 'bg-[#23263A] border-white/10 text-[#71758B] hover:text-[#F8FAFC] hover:border-white/20'
                }`}
                title={saved ? 'Remove from saved library' : 'Save to library'}
                aria-label={saved ? 'Remove from saved library' : 'Save to library'}
              >
                <Bookmark className={`w-3.5 h-3.5 ${saved ? 'fill-amber-400 text-amber-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Title */}
          <Link to={`/papers/${paper.id}`} className="block group-hover:text-violet-400 transition">
            <h3 className="text-sm sm:text-base font-bold text-[#F8FAFC] leading-snug line-clamp-2 mb-2 group-hover:text-violet-300 transition-colors">
              {paper.title}
            </h3>
          </Link>

          {/* Authors */}
          <p className="text-xs text-[#A1A1B5] font-medium mb-3 line-clamp-1">
            {formatAuthors(paper.authors, 3)}
          </p>

          {/* Abstract */}
          {paper.abstract && (
            <p className="text-xs text-[#71758B] line-clamp-3 leading-relaxed mb-4 font-normal">
              {paper.abstract}
            </p>
          )}
        </div>

        {/* Footer info: date & size & explore */}
        <div className="pt-3.5 border-t border-white/[0.07] flex items-center justify-between text-xs text-[#71758B] font-medium">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#71758B]" />
            <span>{formatDate(paper.uploaded_at, { shortMonth: true })}</span>
          </div>

          <div className="flex items-center gap-3">
            {paper.file_size_bytes && (
              <span className="hidden sm:flex items-center gap-1">
                <HardDrive className="w-3.5 h-3.5 text-[#71758B]" />
                <span>{formatBytes(paper.file_size_bytes)}</span>
              </span>
            )}

            <Link
              to={`/papers/${paper.id}`}
              className="inline-flex items-center gap-1 text-xs font-bold text-violet-400 hover:text-violet-300 transition group/link"
            >
              <span>Explore & Read</span>
              <ArrowUpRight className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
