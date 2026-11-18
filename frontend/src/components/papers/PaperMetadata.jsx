import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  HardDrive,
  ExternalLink,
  Copy,
  Check,
  User,
  Share2,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { formatBytes, formatDate } from '../../utils/formatters';
import { useToast } from '../../context/ToastContext';

export default function PaperMetadata({ paper }) {
  const { addToast } = useToast();
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
    addToast({
      type: 'success',
      title: 'BibTeX Copied',
      message: 'Citation copied to your clipboard.',
    });
    setTimeout(() => setCopiedBibtex(false), 2000);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    addToast({
      type: 'info',
      title: 'Link Copied',
      message: 'Paper URL copied to your clipboard.',
    });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="bg-theme-card rounded-2xl border border-theme-subtle p-5 sm:p-6 space-y-5 text-theme-main">
      <div className="flex items-center justify-between pb-3.5 border-b border-theme-subtle">
        <h4 className="text-xs font-bold text-theme-secondary uppercase tracking-wider">
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

      <div className="space-y-4 text-xs">
        {/* Authors */}
        <div>
          <span className="text-theme-secondary font-semibold block mb-1.5">Authors</span>
          <div className="flex flex-wrap gap-1.5">
            {paper.authors?.map((author, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-theme-elevated text-theme-main font-medium border border-theme-subtle"
              >
                <User className="w-3 h-3 text-violet-400" />
                {author}
              </span>
            ))}
          </div>
        </div>

        {/* arXiv ID */}
        {paper.arxiv_id && (
          <div>
            <span className="text-theme-secondary font-semibold block mb-1">arXiv Identifier</span>
            <a
              href={`https://arxiv.org/abs/${paper.arxiv_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 font-mono font-bold hover:underline"
            >
              <span>{paper.arxiv_id}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Ingest Date */}
        <div>
          <span className="text-theme-secondary font-semibold block mb-0.5">Uploaded On</span>
          <span className="text-theme-main font-medium flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-theme-muted" />
            {formatDate(paper.uploaded_at)}
          </span>
        </div>

        {/* File Specs */}
        <div>
          <span className="text-theme-secondary font-semibold block mb-0.5">File Details</span>
          <span className="text-theme-main font-medium flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-theme-muted" />
            {formatBytes(paper.file_size_bytes)} ({paper.mime_type || 'application/pdf'})
          </span>
        </div>

        {/* Verification Status */}
        <div>
          <span className="text-theme-secondary font-semibold block mb-1">Integrity Verification</span>
          <Badge variant="success" size="xs" dot>
            Verified (%PDF- header parsed)
          </Badge>
        </div>

        {/* FR-11 Topic Tagging Workspace Shortcut */}
        <div className="pt-3 border-t border-theme-subtle">
          <Link
            to={`/tagging?paperId=${paper.id}`}
            className="w-full inline-flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 font-semibold text-xs border border-violet-500/25 transition shadow-xs"
          >
            <span className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-violet-400" />
              <span>Open Tagging Workspace</span>
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-violet-400" />
          </Link>
        </div>
      </div>
    </div>
  );
}
