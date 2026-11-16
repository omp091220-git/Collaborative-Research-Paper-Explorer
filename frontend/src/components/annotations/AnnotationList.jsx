import { useState, useEffect, useCallback } from 'react';
import AnnotationCard from './AnnotationCard';
import AddAnnotationModal from './AddAnnotationModal';
import Button from '../common/Button';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import { MessageSquarePlus, MessageSquare, RefreshCw } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { annotationsService } from '../../services/annotations.service';
import paperTagsService from '../../services/paperTags.service';
import { getApiErrorMessage } from '../../services/api';

export default function AnnotationList({
  paperId,
  annotations: initialAnnotations,
  loading: initialLoading,
  onAddAnnotation,
}) {
  const { addToast } = useToast();

  const [annotations, setAnnotations] = useState(initialAnnotations || []);
  const [annotationTagsMap, setAnnotationTagsMap] = useState({});
  const [loading, setLoading] = useState(paperId ? true : Boolean(initialLoading));
  const [error, setError] = useState(null);
  const [selectedPage, setSelectedPage] = useState('all');

  // Modal edit/create states
  const [modalOpen, setModalOpen] = useState(false);
  const [annotationToEdit, setAnnotationToEdit] = useState(null);

  const fetchAnnotations = useCallback(async () => {
    if (!paperId) return;
    setLoading(true);
    setError(null);
    try {
      const [annotRes, assignRes] = await Promise.allSettled([
        annotationsService.getAnnotations(paperId),
        paperTagsService.getAssignmentsForPaper(paperId),
      ]);

      if (annotRes.status === 'fulfilled') {
        setAnnotations(Array.isArray(annotRes.value) ? annotRes.value : []);
      } else {
        throw annotRes.reason;
      }

      if (assignRes.status === 'fulfilled') {
        const assignments = assignRes.value?.assignments || [];
        const map = {};
        for (const a of assignments) {
          if (a.annotation_id) {
            if (!map[a.annotation_id]) map[a.annotation_id] = [];
            map[a.annotation_id].push(a);
          }
        }
        setAnnotationTagsMap(map);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to retrieve annotations for this paper.'));
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  useEffect(() => {
    if (paperId) {
      fetchAnnotations();
    } else if (initialAnnotations) {
      setAnnotations(initialAnnotations);
    }
  }, [paperId, initialAnnotations, fetchAnnotations]);

  const handleOpenAdd = () => {
    if (onAddAnnotation) {
      onAddAnnotation();
    } else {
      setAnnotationToEdit(null);
      setModalOpen(true);
    }
  };

  const handleEdit = (annot) => {
    setAnnotationToEdit(annot);
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await annotationsService.deleteAnnotation(id);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      addToast({
        type: 'success',
        title: 'Annotation Deleted',
        message: 'The research note has been permanently removed.',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Delete Failed',
        message: getApiErrorMessage(err, 'Could not delete annotation.'),
      });
      throw err;
    }
  };

  const handleSaved = (savedAnnot) => {
    if (paperId) {
      fetchAnnotations();
    } else {
      setAnnotations((prev) => {
        const exists = prev.some((a) => a.id === savedAnnot.id);
        if (exists) {
          return prev.map((a) => (a.id === savedAnnot.id ? savedAnnot : a));
        }
        return [savedAnnot, ...prev];
      });
    }
    setModalOpen(false);
  };

  const pages = Array.from(
    new Set(annotations.map((a) => a.page_number).filter(Boolean))
  ).sort((a, b) => a - b);

  const filtered =
    selectedPage === 'all'
      ? annotations
      : annotations.filter((a) => a.page_number === Number(selectedPage));

  return (
    <div className="space-y-5 text-[#F8FAFC]">
      {/* Header with Page Filter & Add CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pb-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm sm:text-base font-bold text-[#F8FAFC]">
            Paper Annotations ({annotations.length})
          </h3>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {pages.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#71758B]">Page:</span>
              <select
                value={selectedPage}
                onChange={(e) => setSelectedPage(e.target.value)}
                className="text-xs bg-[#23263A] border border-white/10 rounded-xl px-2.5 py-1.5 text-[#F8FAFC] cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              >
                <option value="all">All Pages ({annotations.length})</option>
                {pages.map((p) => (
                  <option key={p} value={p}>
                    Page {p}
                  </option>
                ))}
              </select>
            </div>
          )}

          {paperId && (
            <Button
              variant="outline"
              size="xs"
              onClick={fetchAnnotations}
              disabled={loading}
              title="Refresh annotations"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          )}

          <Button
            variant="primary"
            size="xs"
            onClick={handleOpenAdd}
            iconLeft={MessageSquarePlus}
          >
            Add Note
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <ErrorState
          title="Could not load annotations"
          message={error}
          onRetry={fetchAnnotations}
        />
      )}

      {/* Loading state */}
      {loading && !error ? (
        <div className="py-12 text-center text-xs text-[#71758B] flex items-center justify-center gap-2.5">
          <span className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="font-medium">Loading research notes...</span>
        </div>
      ) : !error && filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={selectedPage === 'all' ? 'No annotations yet' : `No annotations on Page ${selectedPage}`}
          description="Add comments, highlight passages, or record mathematical insights on this preprint."
          actionLabel="Add First Annotation"
          onAction={handleOpenAdd}
          actionIcon={MessageSquarePlus}
        />
      ) : (
        <div className="space-y-3.5">
          {filtered.map((item) => (
            <AnnotationCard
              key={item.id}
              annotation={item}
              tags={annotationTagsMap[item.id] || []}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal for adding/editing */}
      {modalOpen && (
        <AddAnnotationModal
          paperId={paperId}
          isOpen={modalOpen}
          annotationToEdit={annotationToEdit}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
