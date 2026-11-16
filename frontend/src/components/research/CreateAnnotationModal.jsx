import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { Tag, Edit3, MessageSquare, Quote, Check } from 'lucide-react';

export default function CreateAnnotationModal({
  isOpen,
  onClose,
  selectionData = null,
  annotationToEdit = null,
  onSave,
  tagTree = [],
  allTags = [],
  loading = false,
}) {
  const [content, setContent] = useState('');
  const [pageNumber, setPageNumber] = useState(1);
  const [selectedTagId, setSelectedTagId] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    if (annotationToEdit) {
      setContent(annotationToEdit.content || '');
      setPageNumber(annotationToEdit.page_number || 1);
      setSelectedTagId('');
    } else if (selectionData) {
      // New annotation from selected text
      setContent('');
      setPageNumber(selectionData.pageNumber || 1);
      setSelectedTagId('');
    } else {
      setContent('');
      setPageNumber(1);
      setSelectedTagId('');
    }
  }, [isOpen, selectionData, annotationToEdit]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    // If selectionData exists, content can be either comment or text itself
    let finalContent = content.trim();
    if (!finalContent) {
      if (selectionData?.text) {
        finalContent = selectionData.text;
      } else {
        setError('Please enter your annotation remarks.');
        return;
      }
    } else if (selectionData?.text && !annotationToEdit) {
      // Include quoted context if user provided both
      finalContent = `"${selectionData.text}"\n\n${finalContent}`;
    }

    const payload = {
      page_number: pageNumber,
      content: finalContent,
      position_x: selectionData?.position_x ?? annotationToEdit?.position_x ?? null,
      position_y: selectionData?.position_y ?? annotationToEdit?.position_y ?? null,
      region_width: selectionData?.region_width ?? annotationToEdit?.region_width ?? null,
      region_height: selectionData?.region_height ?? annotationToEdit?.region_height ?? null,
      tag_id: selectedTagId || null,
    };

    onSave(payload);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={annotationToEdit ? 'Edit Annotation' : 'Create Research Annotation'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium">
            {error}
          </div>
        )}

        {/* Selected text quote if applicable */}
        {selectionData?.text && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
              <span className="flex items-center gap-1">
                <Quote className="w-3 h-3 text-indigo-500" /> Quoted Text (Page {selectionData.pageNumber})
              </span>
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 italic leading-relaxed line-clamp-3">
              "{selectionData.text}"
            </p>
          </div>
        )}

        {/* Comment remarks */}
        <div>
          <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
            Research Remarks & Notes {selectionData?.text && <span className="font-normal text-slate-500">(optional)</span>}
          </label>
          <textarea
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              selectionData?.text
                ? 'Add your commentary, hypothesis, or cross-reference here...'
                : 'Enter your research notes, findings, or critique for this page...'
            }
            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-sans"
            autoFocus
          />
        </div>

        {/* Optional Page number if manual entry */}
        {!selectionData && (
          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
              Page Number
            </label>
            <input
              type="number"
              min="1"
              value={pageNumber}
              onChange={(e) => setPageNumber(parseInt(e.target.value, 10) || 1)}
              className="w-24 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono"
            />
          </div>
        )}

        {/* Optional Topic Tag Assignment (FR-11) */}
        {!annotationToEdit && allTags.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Assign Topic Tag (optional)</span>
            </label>
            <select
              value={selectedTagId}
              onChange={(e) => setSelectedTagId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 font-sans"
            >
              <option value="">(None - No Topic Tag)</option>
              {allTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.canonicalPath ? `${t.canonicalPath} (${t.name})` : t.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Links this annotation to an FR-10 hierarchical taxonomy tag.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={loading}>
            {annotationToEdit ? 'Save Changes' : 'Create Annotation'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
