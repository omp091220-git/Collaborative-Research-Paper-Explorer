import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { annotationsService } from '../../services/annotations.service';
import { useToast } from '../../context/ToastContext';

export default function AddAnnotationModal({
  isOpen,
  onClose,
  paperId,
  annotationToEdit = null,
  onSaved,
  onCreated,
}) {
  const { success, error: showError } = useToast();
  const notifySuccess = onSaved || onCreated;
  const [pageNumber, setPageNumber] = useState(1);
  const [content, setContent] = useState('');
  const [useCoords, setUseCoords] = useState(false);
  const [posX, setPosX] = useState('0.15');
  const [posY, setPosY] = useState('0.25');
  const [width, setWidth] = useState('0.40');
  const [height, setHeight] = useState('0.10');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (annotationToEdit) {
      setPageNumber(annotationToEdit.page_number || 1);
      setContent(annotationToEdit.content || '');
      if (annotationToEdit.position_x !== null && annotationToEdit.position_x !== undefined) {
        setUseCoords(true);
        setPosX(String(annotationToEdit.position_x));
        setPosY(String(annotationToEdit.position_y));
        setWidth(String(annotationToEdit.region_width || '0.30'));
        setHeight(String(annotationToEdit.region_height || '0.10'));
      } else {
        setUseCoords(false);
      }
    } else {
      setPageNumber(1);
      setContent('');
      setUseCoords(false);
    }
  }, [annotationToEdit, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) {
      showError('Content Required', 'Please enter your annotation remarks.');
      return;
    }
    const page = parseInt(pageNumber, 10);
    if (isNaN(page) || page < 1) {
      showError('Invalid Page', 'Page number must be 1 or greater.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        paper_id: paperId,
        page_number: page,
        content: content.trim(),
        position_x: useCoords ? parseFloat(posX) : null,
        position_y: useCoords ? parseFloat(posY) : null,
        region_width: useCoords ? parseFloat(width) : null,
        region_height: useCoords ? parseFloat(height) : null,
      };

      if (annotationToEdit) {
        const updatePayload = {
          page_number: page,
          content: content.trim(),
          ...(useCoords
            ? {
                position_x: parseFloat(posX),
                position_y: parseFloat(posY),
                region_width: parseFloat(width),
                region_height: parseFloat(height),
              }
            : {}),
        };
        const res = await annotationsService.updateAnnotation(annotationToEdit.id, updatePayload);
        success('Annotation Updated', 'Your changes have been saved.');
        if (notifySuccess) notifySuccess(res.annotation);
      } else {
        const res = await annotationsService.createAnnotation(payload);
        success('Annotation Created', 'Your annotation was added to the paper.');
        if (notifySuccess) notifySuccess(res.annotation);
      }
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to save annotation.';
      showError('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={annotationToEdit ? 'Edit Annotation' : 'Add Paper Annotation'}
      description="Attach inline remarks, peer reviews, or highlighted coordinates to this paper."
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Target Page Number <span className="text-rose-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            value={pageNumber}
            onChange={(e) => setPageNumber(e.target.value)}
            className="w-28 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Annotation Notes / Commentary <span className="text-rose-500">*</span>
          </label>
          <textarea
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="e.g. In Equation 4, verify convergence guarantees under noisy gradients..."
            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-y"
            required
          />
        </div>

        {/* Spatial highlight coordinates toggle */}
        <div className="pt-2 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 select-none">
            <input
              type="checkbox"
              checked={useCoords}
              onChange={(e) => setUseCoords(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20"
            />
            <span>Specify spatial bounding box coordinates (optional)</span>
          </label>

          {useCoords && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">X (0.0-1.0)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={posX}
                  onChange={(e) => setPosX(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Y (0.0-1.0)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={posY}
                  onChange={(e) => setPosY(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Width (&gt;0)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Height (&gt;0)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            loading={submitting}
            disabled={!content.trim()}
          >
            {annotationToEdit ? 'Save Changes' : 'Post Annotation'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
