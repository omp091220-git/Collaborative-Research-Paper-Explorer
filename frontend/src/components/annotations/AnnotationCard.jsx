import { useState } from 'react';
import { Edit2, Trash2, MapPin, User, Clock, Tag, Loader2 } from 'lucide-react';
import Badge from '../common/Badge';
import { formatDate } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import ConfirmationDialog from '../common/ConfirmationDialog';
import MarkdownMathRenderer from '../research/MarkdownMathRenderer';

export default function AnnotationCard({
  annotation,
  onEdit,
  onDelete,
  tags = [],
}) {
  const { user, isAdmin } = useAuth();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Ownership & Permission Logic
  const isAuthor = Boolean(user?.id && annotation.created_by && annotation.created_by === user.id);
  const canEdit = isAuthor || isAdmin;
  // Researchers can delete their own annotations; Admins can delete any annotation (including legacy records)
  const canDelete = isAuthor || isAdmin;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(annotation.id);
      setDeleteConfirmOpen(false);
    } catch {
      // Error is caught & alerted by parent onDelete handler
    } finally {
      setDeleting(false);
    }
  };

  const hasCoords =
    annotation.position_x !== null &&
    annotation.position_y !== null &&
    annotation.position_x !== undefined &&
    annotation.position_y !== undefined;

  return (
    <div className="p-4 sm:p-5 rounded-2xl border border-white/[0.08] bg-[#1B1D2B] hover:border-white/20 transition-all shadow-sm space-y-3 text-[#F8FAFC]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="primary" size="xs">
            Page {annotation.page_number}
          </Badge>
          {hasCoords && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-mono text-[#A1A1B5] bg-[#23263A] px-2 py-0.5 rounded-md border border-white/10"
              title={`Coordinates: X: ${(annotation.position_x * 100).toFixed(0)}%, Y: ${(annotation.position_y * 100).toFixed(0)}%`}
            >
              <MapPin className="w-2.5 h-2.5 text-violet-400" />
              <span>
                {(annotation.position_x * 100).toFixed(0)}%, {(annotation.position_y * 100).toFixed(0)}%
              </span>
            </span>
          )}
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          {canEdit && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(annotation)}
              className="p-1.5 rounded-lg text-[#71758B] hover:text-[#F8FAFC] hover:bg-white/10 transition cursor-pointer"
              title="Edit annotation"
              aria-label="Edit annotation"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteConfirmOpen(true)}
              className="p-1.5 rounded-lg text-[#71758B] hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-40"
              title={isAdmin && !isAuthor ? 'Delete annotation (Admin override)' : 'Delete annotation'}
              aria-label="Delete annotation"
            >
              {deleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content (FR-15 Rich Markdown & LaTeX) */}
      <div className="text-xs sm:text-sm text-[#F8FAFC] leading-relaxed font-sans">
        <MarkdownMathRenderer content={annotation.content} />
      </div>

      {/* Assigned Tags if present */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {tags.map((t) => (
            <span
              key={t.id || t.assignment_id || t.tag_id}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-violet-500/15 border border-violet-500/25 text-[10px] font-bold text-violet-300"
              title={t.canonical_path || t.canonicalPath || t.tag_name || t.name}
            >
              <Tag className="w-2.5 h-2.5 text-violet-400" />
              <span>{t.tag_name || t.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Meta Footer */}
      <div className="pt-2.5 border-t border-white/[0.07] flex items-center justify-between text-[11px] text-[#71758B]">
        <span className="flex items-center gap-1.5">
          <User className="w-3 h-3 text-[#71758B]" />
          <span>
            {isAuthor
              ? 'You'
              : annotation.author_name || (annotation.created_by ? `Scholar (${annotation.created_by.slice(0, 8)})` : 'Legacy Record')}
          </span>
        </span>

        <span className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-[#71758B]" />
          <span>{formatDate(annotation.created_at, { shortMonth: true })}</span>
        </span>
      </div>

      {/* Delete Confirmation */}
      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Annotation"
        message="Are you sure you want to permanently delete this annotation from the research paper? (The original document remains unaffected)."
        confirmText="Delete Annotation"
        danger
      />
    </div>
  );
}
