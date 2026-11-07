import { Link } from 'react-router-dom';
import { Bookmark, FileText, ExternalLink, Calendar, HardDrive, ArrowUpRight } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import { formatBytes, formatDate, formatAuthors } from '../../utils/formatters';
import { useLibrary } from '../../context/LibraryContext';

export default function PaperCard({ paper }) {
  const { isBookmarked, toggleBookmark } = useLibrary();
  const saved = isBookmarked(paper.id);

  return (
    <Card hoverable className="flex flex-col h-full group bg-white border-slate-200/80">
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          {/* Header row: arXiv badge & bookmark */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              {paper.arxiv_id ? (
                <a
                  href={`https://arxiv.org/abs/${paper.arxiv_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/80 hover:bg-amber-100 transition"
                  title="View on arXiv"
                >
                  <span>arXiv:{paper.arxiv_id}</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              ) : (
                <Badge variant="default" size="xs">
                  <FileText className="w-3 h-3 text-slate-400" />
                  <span>PDF Document</span>
                </Badge>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleBookmark(paper);
              }}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                saved
                  ? 'bg-amber-50 border-amber-300 text-amber-600'
                  : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300'
              }`}
              title={saved ? 'Remove from saved library' : 'Save to library'}
              aria-label={saved ? 'Remove from saved library' : 'Save to library'}
            >
              <Bookmark className={`w-3.5 h-3.5 ${saved ? 'fill-amber-500' : ''}`} />
            </button>
          </div>

          {/* Title */}
          <Link to={`/papers/${paper.id}`} className="block group-hover:text-indigo-600 transition">
            <h3 className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 mb-1.5">
              {paper.title}
            </h3>
          </Link>

          {/* Authors */}
          <p className="text-xs text-slate-500 font-medium mb-2.5 line-clamp-1">
            {formatAuthors(paper.authors, 3)}
          </p>

          {/* Abstract */}
          {paper.abstract && (
            <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed mb-4">
              {paper.abstract}
            </p>
          )}
        </div>

        {/* Footer info: date & size */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(paper.uploaded_at, { shortMonth: true })}</span>
          </div>

          <div className="flex items-center gap-3">
            {paper.file_size_bytes && (
              <span className="flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                <span>{formatBytes(paper.file_size_bytes)}</span>
              </span>
            )}

            <Link
              to={`/papers/${paper.id}`}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition"
            >
              <span>Explore</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
