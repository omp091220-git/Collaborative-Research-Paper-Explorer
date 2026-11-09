import { useState } from 'react';
import { Tag, Plus, X, AlertCircle, RefreshCw } from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import HierarchicalTagPicker from '../tags/HierarchicalTagPicker';
import ConfirmationDialog from '../common/ConfirmationDialog';
import paperTagsService from '../../services/paperTags.service';
import { getApiErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export default function PaperTagSection({
  paper,
  assignments = [],
  tagTree = [],
  onRefresh,
  canAssign = false,
  loading = false,
}) {
  const { addToast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Filter paper-level assignments (annotation_id is null/undefined)
  const paperAssignments = assignments.filter((a) => !a.annotation_id);
  const assignedTagIds = paperAssignments.map((a) => a.tag_id);

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
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Tag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Paper-Level Topic Tags</span>
            <Badge variant="indigo" size="xs">
              {paperAssignments.length}
            </Badge>
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
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
              className="gap-1.5"
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
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl flex items-start gap-2 text-xs text-rose-800 dark:text-rose-200 font-semibold">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
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
        <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Loading tag assignments...</span>
        </div>
      ) : paperAssignments.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 text-xs text-slate-600 dark:text-slate-400">
          <p className="font-semibold text-slate-800 dark:text-slate-200">
            No topic tags assigned to this paper yet.
          </p>
          {canAssign ? (
            <p className="mt-1">
              Click <strong>Assign Tag</strong> above to categorize this paper in the research taxonomy.
            </p>
          ) : (
            <p className="mt-1">
              Researchers and administrators can assign taxonomy tags to this paper.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          {paperAssignments.map((assignment) => (
            <div
              key={assignment.id}
              className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-slate-100 hover:border-indigo-300 dark:hover:border-indigo-700 transition shadow-2xs"
            >
              <Tag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{assignment.tag_name}</span>
              {assignment.canonical_path && (
                <span
                  className="text-[10px] font-mono text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 max-w-[200px] truncate"
                  title={assignment.canonical_path}
                >
                  {assignment.canonical_path}
                </span>
              )}
              {canAssign && (
                <button
                  type="button"
                  onClick={() => setAssignmentToDelete(assignment)}
                  className="ml-1 p-0.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                  title={`Remove "${assignment.tag_name}" assignment from this paper`}
                  aria-label="Remove tag assignment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
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
