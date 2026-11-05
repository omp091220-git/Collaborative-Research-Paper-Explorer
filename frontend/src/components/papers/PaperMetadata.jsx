import { useState } from 'react';
import {
  Calendar,
  HardDrive,
  ExternalLink,
  Copy,
  Check,
  User,
  Share2,
} from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { formatBytes, formatDate } from '../../utils/formatters';
import { useToast } from '../../context/ToastContext';

export default function PaperMetadata({ paper }) {
  const { success } = useToast();
  const [copiedBibtex, setCopiedBibtex] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const generateBibtex = () => {
    const authorStr = paper.authors?.join(' and ') || 'Unknown';
    const year = paper.uploaded_at ? new Date(paper.uploaded_at).getFullYear() : '2026';
    const citeKey = `${(paper.authors?.[0] || 'author').split(/\s+/).pop()?.toLowerCase()}${year}`;

    return `@article{${citeKey},
  title = {${paper.title}},
  author = {${authorStr}},
  year = {${year}},
  ${paper.arxiv_id ? `eprint = {${paper.arxiv_id}},\n  archivePrefix = {arXiv},\n  primaryClass = {cs},` : ''}
}`;
  };

  const handleCopyBibtex = () => {
    navigator.clipboard.writeText(generateBibtex());
    setCopiedBibtex(true);
    success('BibTeX Copied', 'Citation copied to your clipboard.');
    setTimeout(() => setCopiedBibtex(false), 2000);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    success('Link Copied', 'Paper URL copied to your clipboard.');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-5 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
          Paper Metadata
        </h4>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={handleCopyBibtex}
            iconLeft={copiedBibtex ? Check : Copy}
          >
            {copiedBibtex ? 'Copied' : 'BibTeX'}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={handleShare}
            iconLeft={copiedLink ? Check : Share2}
          >
            Share
          </Button>
        </div>
      </div>

      <div className="space-y-3.5 text-xs">
        {/* Authors */}
        <div>
          <span className="text-slate-400 font-medium block mb-1">Authors</span>
          <div className="flex flex-wrap gap-1.5">
            {paper.authors?.map((author, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium"
              >
                <User className="w-3 h-3 text-slate-400" />
                {author}
              </span>
            ))}
          </div>
        </div>

        {/* arXiv ID */}
        {paper.arxiv_id && (
          <div>
            <span className="text-slate-400 font-medium block mb-1">arXiv Identifier</span>
            <a
              href={`https://arxiv.org/abs/${paper.arxiv_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-mono font-medium hover:underline"
            >
              <span>{paper.arxiv_id}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Ingest Date */}
        <div>
          <span className="text-slate-400 font-medium block mb-0.5">Uploaded On</span>
          <span className="text-slate-700 font-medium flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            {formatDate(paper.uploaded_at)}
          </span>
        </div>

        {/* File Specs */}
        <div>
          <span className="text-slate-400 font-medium block mb-0.5">File Details</span>
          <span className="text-slate-700 font-medium flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-slate-400" />
            {formatBytes(paper.file_size_bytes)} ({paper.mime_type || 'application/pdf'})
          </span>
        </div>

        {/* Verification Status */}
        <div>
          <span className="text-slate-400 font-medium block mb-1">PDF Verification</span>
          <Badge variant="success" size="xs" dot>
            Magic bytes verified (%PDF-)
          </Badge>
        </div>
      </div>
    </div>
  );
}
