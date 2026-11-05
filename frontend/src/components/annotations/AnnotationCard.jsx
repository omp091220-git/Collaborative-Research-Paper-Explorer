import { useState } from 'react';
import { Edit2, Trash2, MapPin, User, Clock } from 'lucide-react';
import Badge from '../common/Badge';
import { formatDate } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import ConfirmationDialog from '../common/ConfirmationDialog';

export default function AnnotationCard({
  annotation,
  onEdit,
  onDelete,
}) {
  const { user, isAdmin } = useAuth();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAuthor = user?.id && annotation.created_by === user.id;
  const canEdit = isAuthor || isAdmin;
  const canDelete = isAdmin; // Backend strictly allows only SYSTEM_ADMIN to delete

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(annotation.id);
      setDeleteConfirmOpen(false);
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
    <div className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition shadow-2xs space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="primary" size="xs">
            Page {annotation.page_number}
          </Badge>
          {hasCoords && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded"
              title={`Coordinates: X: ${(annotation.position_x * 100).toFixed(0)}%, Y: ${(annotation.position_y * 100).toFixed(0)}%`}
            >
              <MapPin className="w-2.5 h-2.5 text-indigo-500" />
              <span>
                {(annotation.position_x * 100).toFixed(0)}%, {(annotation.position_y * 100).toFixed(0)}%
              </span>
            </span>
          )}
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit(annotation)}
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              title="Edit annotation"
              aria-label="Edit annotation"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
              title="Delete annotation (Admin only)"
              aria-label="Delete annotation"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">
        {annotation.content}
      </p>

      {/* Meta Footer */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <User className="w-3 h-3" />
          <span>{isAuthor ? 'You' : `User ${annotation.created_by?.slice(0, 8)}...`}</span>
        </span>

        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
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
        message="Are you sure you want to permanently delete this annotation from the research paper?"
        confirmText="Delete Annotation"
        danger
      />
    </div>
  );
}
