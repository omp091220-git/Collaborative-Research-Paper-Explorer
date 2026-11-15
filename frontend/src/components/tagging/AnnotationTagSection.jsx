import { useState } from 'react';
import { Tag, Plus, X, AlertCircle, Edit3, MapPin, RefreshCw, Info } from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import HierarchicalTagPicker from '../tags/HierarchicalTagPicker';
import ConfirmationDialog from '../common/ConfirmationDialog';
import paperTagsService from '../../services/paperTags.service';
import { getApiErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export default function AnnotationTagSection({
  paper,
  annotations = [],
  assignments = [],
  tagTree = [],
  onRefresh,
  canAssign = false,
  loading = false,
}) {
  const { addToast } = useToast();
  const [activeAnnotationIdForPicker, setActiveAnnotationIdForPicker] = useState(null);
  const [assignmentToDelete, setAssignmentToDelete] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Group assignments by annotation_id
  const assignmentsByAnnotation = {};
  for (const a of assignments) {
    if (a.annotation_id) {
      if (!assignmentsByAnnotation[a.annotation_id]) {
        assignmentsByAnnotation[a.annotation_id] = [];
      }
      assignmentsByAnnotation[a.annotation_id].push(a);
    }
  }

  const handleAssignTagToAnnotation = async (annotationId, selectedTag) => {
    setActionError(null);
    setAssigning(true);
    try {
      await paperTagsService.createAssignment({
        paper_id: paper.id,
        tag_id: selectedTag.id,
        annotation_id: annotationId,
      });

      addToast({
        type: 'success',
        title: 'Annotation Tag Assigned',
        message: `Assigned "${selectedTag.name}" to annotation.`,
      });
      setActiveAnnotationIdForPicker(null);
      onRefresh && onRefresh();
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to assign tag to annotation.');
      setActionError(msg);
      addToast({
        type: 'error',
        title: 'Assignment Failed',
        message: msg,
      });
    } finally {
      setAssigning(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!assignmentToDelete) return;
    setDeleting(true);
    setActionError(null);
    try {
      await paperTagsService.deleteAssignment(assignmentToDelete.id);
      addToast({
        type: 'info',
        title: 'Annotation Tag Removed',
        message: `Removed tag assignment from annotation. The tag remains in taxonomy.`,
      });
      setAssignmentToDelete(null);
      onRefresh && onRefresh();
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to remove annotation tag assignment.');
      setActionError(msg);
      addToast({
        type: 'error',
        title: 'Removal Failed',
        message: msg,
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>Annotation-Level Topic Tags</span>
            <Badge variant="purple" size="xs">
              {annotations.length} {annotations.length === 1 ? 'Annotation' : 'Annotations'}
            </Badge>
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Assign fine-grained taxonomy topics to specific highlighted regions and page annotations
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          iconLeft={RefreshCw}
          className={`p-2 self-start sm:self-auto ${loading ? 'animate-spin' : ''}`}
          title="Refresh annotation tags"
          aria-label="Refresh annotation tags"
        />
      </div>

      {/* Scope Disclaimer regarding PDF section extraction */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
        <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Taxonomy Scope:</strong> Tagging is anchored to verified paper-level records and user-created page annotations. Automated PDF document section extraction is not currently enabled on this backend.
        </p>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl flex items-start gap-2 text-xs text-rose-800 dark:text-rose-200 font-semibold">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Annotations List */}
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-slate-500">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Loading paper annotations...</span>
        </div>
      ) : annotations.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 text-xs text-slate-600 dark:text-slate-400">
          <p className="font-semibold text-slate-800 dark:text-slate-200">
            No annotations recorded for this paper yet.
          </p>
          <p className="mt-1">
            Open the paper in the PDF Viewer to create page annotations, then return here to attach hierarchical topic tags.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {annotations.map((annot) => {
            const annotAssignments = assignmentsByAnnotation[annot.id] || [];
            const assignedIds = annotAssignments.map((a) => a.tag_id);
            const isPickerOpen = activeAnnotationIdForPicker === annot.id;
            const hasCoords =
              annot.position_x !== null &&
              annot.position_y !== null &&
              annot.position_x !== undefined &&
              annot.position_y !== undefined;

            return (
              <div
                key={annot.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3"
              >
                {/* Annotation Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="primary" size="xs">
                      Page {annot.page_number}
                    </Badge>
                    {hasCoords && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded"
                        title={`Coordinates: X: ${(annot.position_x * 100).toFixed(0)}%, Y: ${(annot.position_y * 100).toFixed(0)}%`}
                      >
                        <MapPin className="w-2.5 h-2.5 text-indigo-600" />
                        <span>
                          {(annot.position_x * 100).toFixed(0)}%, {(annot.position_y * 100).toFixed(0)}%
                        </span>
                      </span>
                    )}
                  </div>

                  {canAssign && (
                    <Button
                      variant={isPickerOpen ? 'outline' : 'ghost'}
                      size="xs"
                      loading={assigning && isPickerOpen}
                      onClick={() => {
                        setActionError(null);
                        setActiveAnnotationIdForPicker((prev) => (prev === annot.id ? null : annot.id));
                      }}
                      iconLeft={isPickerOpen ? X : Plus}
                    >
                      {isPickerOpen ? 'Cancel' : 'Tag Annotation'}
                    </Button>
                  )}
                </div>

                {/* Annotation Content */}
                <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  {annot.content}
                </p>

                {/* Picker for this specific annotation */}
                {isPickerOpen && canAssign && (
                  <div className="pt-2 pb-1">
                    <HierarchicalTagPicker
                      tagTree={tagTree}
                      assignedTagIds={assignedIds}
                      onSelectTag={(tag) => handleAssignTagToAnnotation(annot.id, tag)}
                      onClose={() => setActiveAnnotationIdForPicker(null)}
                      title={`Assign Topic Tag to Page ${annot.page_number} Annotation`}
                    />
                  </div>
                )}

                {/* Assigned Tags to this Annotation */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mr-1">
                    Tags ({annotAssignments.length}):
                  </span>
                  {annotAssignments.length === 0 ? (
                    <span className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                      No tags assigned to this note
                    </span>
                  ) : (
                    annotAssignments.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-[11px] font-bold text-purple-900 dark:text-purple-200"
                      >
                        <Tag className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                        <span>{a.tag_name}</span>
                        {a.canonical_path && (
                          <span
                            className="font-mono text-[9px] text-purple-700 dark:text-purple-300 max-w-[140px] truncate"
                            title={a.canonical_path}
                          >
                            ({a.canonical_path})
                          </span>
                        )}
                        {canAssign && (
                          <button
                            type="button"
                            onClick={() => setAssignmentToDelete(a)}
                            className="hover:text-rose-600 p-0.5 rounded cursor-pointer"
                            title="Remove tag from annotation"
                            aria-label="Remove tag from annotation"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Dialog for Removal */}
      <ConfirmationDialog
        isOpen={Boolean(assignmentToDelete)}
        onClose={() => setAssignmentToDelete(null)}
        onConfirm={handleConfirmDelete}
        loading={deleting}
        title="Remove Annotation Tag"
        message={`Are you sure you want to remove the tag "${assignmentToDelete?.tag_name}" from this annotation? The tag itself will remain in your taxonomy.`}
        confirmText="Remove Tag"
        danger
      />
    </div>
  );
}
