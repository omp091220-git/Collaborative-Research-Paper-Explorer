import { useState } from 'react';
import { Tag, Plus, X, AlertCircle, Edit3, MapPin, RefreshCw, Info, Lock } from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import HierarchicalTagPicker from '../tags/HierarchicalTagPicker';
import ConfirmationDialog from '../common/ConfirmationDialog';
import paperTagsService from '../../services/paperTags.service';
import { getApiErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export default function AnnotationTagSection({
  paper,
  annotations = [],
  assignments = [],
  tagTree = [],
  onRefresh,
  canAssign = false,
  loading = false,
}) {
  const { user, isAdmin } = useAuth();
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

  // Permission check: User can remove tag if they are SYSTEM_ADMIN or the assigner
  const canRemoveAssignment = (a) =>
    Boolean(isAdmin || (user?.id && a.assigned_by && a.assigned_by === user.id));

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
    <div className="bg-[#1B1D2B] rounded-2xl border border-white/[0.08] p-5 sm:p-6 shadow-sm space-y-4 text-[#F8FAFC]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-white/[0.07]">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-[#F8FAFC] flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-violet-400" />
            <span>Annotation-Level Topic Tags</span>
            <Badge variant="purple" size="xs">
              {annotations.length} {annotations.length === 1 ? 'Annotation' : 'Annotations'}
            </Badge>
          </h3>
          <p className="text-xs text-[#A1A1B5] mt-1">
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

      {/* Scope Disclaimer */}
      <div className="p-3.5 rounded-xl bg-[#161827] border border-white/[0.08] flex items-start gap-2.5 text-xs text-[#A1A1B5]">
        <Info className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-[#F8FAFC]">Taxonomy Scope:</strong> Tagging is anchored to verified paper-level records and user-created page annotations.
        </p>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-500/15 border border-rose-500/25 rounded-xl flex items-start gap-2 text-xs text-rose-300 font-medium">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Annotations List */}
      {loading ? (
        <div className="flex items-center gap-2.5 py-6 text-xs text-[#71758B]">
          <RefreshCw className="w-4 h-4 animate-spin text-violet-400" />
          <span>Loading paper annotations...</span>
        </div>
      ) : annotations.length === 0 ? (
        <div className="p-6 text-center rounded-2xl border border-dashed border-white/10 bg-[#161827]/50 text-xs text-[#A1A1B5]">
          <p className="font-semibold text-[#F8FAFC]">
            No annotations recorded for this paper yet.
          </p>
          <p className="mt-1 text-[#71758B]">
            Open the paper in the PDF Viewer to create page annotations, then return here to attach hierarchical topic tags.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {annotations.map((annotation) => {
            const annotationTags = assignmentsByAnnotation[annotation.id] || [];
            const isPickerActive = activeAnnotationIdForPicker === annotation.id;
            const assignedTagIds = annotationTags.map((a) => a.tag_id);

            return (
              <div
                key={annotation.id}
                className="p-4 rounded-xl bg-[#23263A] border border-white/10 space-y-3 transition hover:border-white/20"
              >
                {/* Annotation Header */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant="primary" size="xs">
                      Page {annotation.page_number}
                    </Badge>
                    {annotation.position_x !== null && annotation.position_x !== undefined && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[#A1A1B5] bg-[#161827] px-2 py-0.5 rounded-md border border-white/10">
                        <MapPin className="w-2.5 h-2.5 text-violet-400" />
                        <span>
                          {(annotation.position_x * 100).toFixed(0)}%,{' '}
                          {(annotation.position_y * 100).toFixed(0)}%
                        </span>
                      </span>
                    )}
                  </div>

                  {canAssign && (
                    <Button
                      variant={isPickerActive ? 'secondary' : 'subtle'}
                      size="xs"
                      onClick={() => {
                        setActionError(null);
                        setActiveAnnotationIdForPicker(isPickerActive ? null : annotation.id);
                      }}
                      iconLeft={Plus}
                    >
                      {isPickerActive ? 'Cancel Tagging' : 'Tag Snippet'}
                    </Button>
                  )}
                </div>

                {/* Annotation Content */}
                <p className="text-xs text-[#F8FAFC] line-clamp-2 italic bg-[#1B1D2B] p-2.5 rounded-lg border border-white/[0.06]">
                  "{annotation.content}"
                </p>

                {/* Tag Picker (if active for this annotation) */}
                {isPickerActive && (
                  <div className="pt-2 pb-1">
                    <HierarchicalTagPicker
                      tagTree={tagTree}
                      assignedTagIds={assignedTagIds}
                      onSelectTag={(tag) => handleAssignTagToAnnotation(annotation.id, tag)}
                      onClose={() => setActiveAnnotationIdForPicker(null)}
                      title={`Assign Topic Tag to Note on Page ${annotation.page_number}`}
                    />
                  </div>
                )}

                {/* Assigned Tags List */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[11px] font-bold text-[#A1A1B5] mr-1">
                    Attached Topics:
                  </span>
                  {annotationTags.length === 0 ? (
                    <span className="text-[11px] text-[#71758B] italic">None yet</span>
                  ) : (
                    annotationTags.map((a) => {
                      const removable = canRemoveAssignment(a);
                      return (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-[11px] font-bold text-violet-300"
                        >
                          <Tag className="w-2.5 h-2.5 text-violet-400" />
                          <span>{a.tag_name}</span>
                          {a.canonical_path && (
                            <span
                              className="font-mono text-[9px] text-[#A1A1B5] max-w-[140px] truncate"
                              title={a.canonical_path}
                            >
                              ({a.canonical_path})
                            </span>
                          )}
                          {removable ? (
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() => setAssignmentToDelete(a)}
                              className="hover:text-rose-400 p-0.5 rounded transition cursor-pointer text-[#71758B] disabled:opacity-40"
                              title={
                                isAdmin && a.assigned_by !== user?.id
                                  ? 'Remove tag (Admin override)'
                                  : 'Remove tag from annotation'
                              }
                              aria-label="Remove tag from annotation"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          ) : (
                            <span
                              className="ml-0.5 text-[#71758B]"
                              title="Assigned by another collaborator. Only the assigner or an admin can remove this tag."
                            >
                              <Lock className="w-2.5 h-2.5 text-[#71758B]" />
                            </span>
                          )}
                        </span>
                      );
                    })
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
