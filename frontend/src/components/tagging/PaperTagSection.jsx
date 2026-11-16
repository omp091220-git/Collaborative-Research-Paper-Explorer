import { useState } from 'react';
import { Tag, Plus, X, AlertCircle, RefreshCw, Lock } from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import HierarchicalTagPicker from '../tags/HierarchicalTagPicker';
import ConfirmationDialog from '../common/ConfirmationDialog';
import paperTagsService from '../../services/paperTags.service';
import { getApiErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export default function PaperTagSection({
  paper,
  assignments = [],
  tagTree = [],
  onRefresh,
  canAssign = false,
  loading = false,
}) {
  const { user, isAdmin } = useAuth();
  const { addToast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Filter paper-level assignments (annotation_id is null/undefined)
  const paperAssignments = assignments.filter((a) => !a.annotation_id);
  const assignedTagIds = paperAssignments.map((a) => a.tag_id);

  // Authorization check: User can remove if they are SYSTEM_ADMIN or the assigner
  const canRemoveAssignment = (a) =>
    Boolean(isAdmin || (user?.id && a.assigned_by && a.assigned_by === user.id));

  const handleAssignTag = async (selectedTag) => {
    setActionError(null);
    setAssigning(true);
    try {
      await paperTagsService.createAssignment({
        paper_id: paper.id,
        tag_id: selectedTag.id,
        annotation_id: null,
      });

      addToast({
        type: 'success',
        title: 'Tag Assigned',
        message: `Assigned "${selectedTag.name}" to paper.`,
      });
      setPickerOpen(false);
      onRefresh && onRefresh();
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to assign tag.');
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
        title: 'Tag Assignment Removed',
        message: `Removed tag from paper. The topic tag remains in taxonomy.`,
      });
      setAssignmentToDelete(null);
      onRefresh && onRefresh();
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to remove tag assignment.');
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
            <Tag className="w-4 h-4 text-violet-400" />
            <span>Paper-Level Topic Tags</span>
            <Badge variant="primary" size="xs">
              {paperAssignments.length}
            </Badge>
          </h3>
          <p className="text-xs text-[#A1A1B5] mt-1">
            Hierarchical research taxonomy topics assigned to this entire publication
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {canAssign && (
            <Button
              variant="primary"
              size="sm"
              loading={assigning}
              onClick={() => {
                setActionError(null);
                setPickerOpen((prev) => !prev);
              }}
              iconLeft={Plus}
            >
              <span>Assign Tag</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            iconLeft={RefreshCw}
            className={`p-2 ${loading ? 'animate-spin' : ''}`}
            title="Refresh assignments"
            aria-label="Refresh assignments"
          />
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-500/15 border border-rose-500/25 rounded-xl flex items-start gap-2 text-xs text-rose-300 font-medium">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Picker Popover / Dropdown */}
      {pickerOpen && canAssign && (
        <div className="pt-2 pb-2">
          <HierarchicalTagPicker
            tagTree={tagTree}
            assignedTagIds={assignedTagIds}
            onSelectTag={handleAssignTag}
            onClose={() => setPickerOpen(false)}
            title={`Assign Topic Tag to "${paper?.title?.slice(0, 40)}..."`}
          />
        </div>
      )}

      {/* Assigned Tags Badges */}
      {loading ? (
        <div className="flex items-center gap-2.5 py-4 text-xs text-[#71758B]">
          <RefreshCw className="w-4 h-4 animate-spin text-violet-400" />
          <span>Loading tag assignments...</span>
        </div>
      ) : paperAssignments.length === 0 ? (
        <div className="p-6 text-center rounded-2xl border border-dashed border-white/10 bg-[#161827]/50 text-xs text-[#A1A1B5]">
          <p className="font-semibold text-[#F8FAFC]">
            No topic tags assigned to this paper yet.
          </p>
          {canAssign ? (
            <p className="mt-1 text-[#71758B]">
              Click <strong>Assign Tag</strong> above to categorize this paper in the research taxonomy.
            </p>
          ) : (
            <p className="mt-1 text-[#71758B]">
              Researchers and administrators can assign taxonomy tags to this paper.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          {paperAssignments.map((assignment) => {
            const removable = canRemoveAssignment(assignment);
            return (
              <div
                key={assignment.id}
                className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#23263A] border border-white/10 text-xs font-semibold text-[#F8FAFC] hover:border-violet-500/40 transition shadow-xs"
              >
                <Tag className="w-3.5 h-3.5 text-violet-400" />
                <span>{assignment.tag_name}</span>
                {assignment.canonical_path && (
                  <span
                    className="text-[10px] font-mono text-[#A1A1B5] bg-[#161827] px-2 py-0.5 rounded-md border border-white/10 max-w-[200px] truncate"
                    title={assignment.canonical_path}
                  >
                    {assignment.canonical_path}
                  </span>
                )}
                {removable ? (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setAssignmentToDelete(assignment)}
                    className="ml-1 p-0.5 rounded-md hover:bg-rose-500/20 text-[#71758B] hover:text-rose-400 transition cursor-pointer disabled:opacity-40"
                    title={
                      isAdmin && assignment.assigned_by !== user?.id
                        ? `Remove "${assignment.tag_name}" (Admin override)`
                        : `Remove "${assignment.tag_name}" assignment from this paper`
                    }
                    aria-label="Remove tag assignment"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span
                    className="ml-1 text-[#71758B]"
                    title="Assigned by another collaborator. Only the assigner or an admin can remove this tag."
                  >
                    <Lock className="w-3 h-3 text-[#71758B]" />
                  </span>
                )}
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
        title="Remove Tag Assignment"
        message={`Are you sure you want to remove the tag "${assignmentToDelete?.tag_name}" from this paper? This will unassign the topic without deleting the tag from the taxonomy.`}
        confirmText="Remove Tag"
        danger
      />
    </div>
  );
}
