import { useState, useRef } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { papersService } from '../../services/papers.service';
import { useToast } from '../../context/ToastContext';
import { MAX_PDF_SIZE_BYTES } from '../../utils/constants';
import { formatBytes } from '../../utils/formatters';
import { UploadCloud, FileText, Link2, Check, AlertCircle } from 'lucide-react';

export default function PaperUploadModal({ isOpen, onClose, onPaperUploaded, onSuccess }) {
  const { success, error: showError } = useToast();
  const handleUploadCallback = onPaperUploaded || onSuccess;
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' or 'arxiv'

  // PDF Upload Form
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [authors, setAuthors] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // arXiv Form
  const [arxivId, setArxivId] = useState('');
  const [importLoading, setImportLoading] = useState(false);

  const fileInputRef = useRef(null);

  const resetForm = () => {
    setFile(null);
    setTitle('');
    setAbstract('');
    setAuthors('');
    setArxivId('');
    setUploadProgress(0);
    setUploadLoading(false);
    setImportLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (uploadLoading || importLoading) return;
    resetForm();
    onClose();
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.type !== 'application/pdf') {
      showError('Invalid File Type', 'Only PDF files are supported.');
      return;
    }

    if (selected.size > MAX_PDF_SIZE_BYTES) {
      showError(
        'File Too Large',
        `File exceeds maximum limit of 30 MB (selected: ${formatBytes(selected.size)}).`
      );
      return;
    }

    setFile(selected);
    if (!title) {
      // Auto-populate title cleanly from filename
      const cleanName = selected.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setTitle(cleanName);
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      showError('No File Selected', 'Please choose a valid PDF file.');
      return;
    }
    if (!title.trim()) {
      showError('Title Required', 'Please provide a title for the research paper.');
      return;
    }
    const authorList = authors
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    if (authorList.length === 0) {
      showError('Authors Required', 'Please provide at least one author name.');
      return;
    }

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('title', title.trim());
    formData.append('abstract', abstract.trim());
    formData.append('authors', JSON.stringify(authorList));

    setUploadLoading(true);
    setUploadProgress(0);

    try {
      const res = await papersService.uploadPaper(formData, (progressEvent) => {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadProgress(percent);
      });

      success('Paper Uploaded', `"${res.paper?.title || title}" has been added to the library.`);
      if (handleUploadCallback) handleUploadCallback(res.paper || res);
      handleClose();
    } catch (err) {
      showError('Upload Failed', err.response?.data?.error || err.message || 'Could not upload PDF.');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleArxivSubmit = async (e) => {
    e.preventDefault();
    if (!arxivId.trim()) {
      showError('arXiv ID Required', 'Please enter an arXiv identifier.');
      return;
    }

    setImportLoading(true);
    try {
      const res = await papersService.importFromArxiv(arxivId.trim());
      success('Paper Imported', `"${res.paper?.title || 'Preprint'}" was fetched from arXiv.`);
      if (handleUploadCallback) handleUploadCallback(res.paper || res);
      handleClose();
    } catch (err) {
      showError('Import Failed', err.response?.data?.error || err.message || 'Could not import from arXiv.');
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Research Paper"
      description="Upload a local PDF file or import directly from the arXiv repository."
      maxWidth="max-w-xl"
    >
      {/* Tabs */}
      <div className="flex border-b border-theme-subtle mb-5">
        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className={`flex items-center gap-2 pb-3 px-4 text-xs font-semibold border-b-2 transition cursor-pointer ${
            activeTab === 'upload'
              ? 'border-violet-500 text-violet-400'
              : 'border-transparent text-theme-muted hover:text-theme-secondary font-medium'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Upload PDF</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('arxiv')}
          className={`flex items-center gap-2 pb-3 px-4 text-xs font-semibold border-b-2 transition cursor-pointer ${
            activeTab === 'arxiv'
              ? 'border-violet-500 text-violet-400'
              : 'border-transparent text-theme-muted hover:text-theme-secondary font-medium'
          }`}
        >
          <Link2 className="w-4 h-4" />
          <span>Import from arXiv</span>
        </button>
      </div>

      {activeTab === 'upload' ? (
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          {/* Drag & Drop File Zone */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="hidden"
              id="modal-pdf-file"
            />
            <label
              htmlFor="modal-pdf-file"
              className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition ${
                file
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : 'border-theme-subtle hover:border-violet-500/50 bg-theme-elevated hover:bg-theme-card'
              }`}
            >
              {file ? (
                <div className="flex items-center gap-3 text-emerald-400">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <Check className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-theme-main">{file.name}</p>
                    <p className="text-[11px] text-emerald-400">{formatBytes(file.size)}</p>
                  </div>
                </div>
              ) : (
                <>
                  <UploadCloud className="w-8 h-8 text-theme-muted mb-2" />
                  <p className="text-xs font-semibold text-theme-main">
                    Click to browse or drop PDF here
                  </p>
                  <p className="text-[11px] text-theme-muted mt-0.5 font-medium">
                    PDF files only, up to 30 MB
                  </p>
                </>
              )}
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold text-theme-main mb-1">
              Paper Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Deep Residual Learning for Image Recognition"
              className="w-full px-3 py-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl text-theme-main placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-theme-main mb-1">
              Authors <span className="text-rose-400">*</span>{' '}
              <span className="text-theme-muted font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              placeholder="e.g. Kaiming He, Xiangyu Zhang, Shaoqing Ren, Jian Sun"
              className="w-full px-3 py-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl text-theme-main placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-theme-main mb-1">
              Abstract <span className="text-theme-muted font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              placeholder="Enter paper abstract summary..."
              className="w-full px-3 py-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl text-theme-main placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 resize-y"
            />
          </div>

          {uploadLoading && uploadProgress > 0 && (
            <div>
              <div className="flex justify-between text-xs text-theme-secondary mb-1 font-semibold">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-theme-elevated rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-violet-600 h-1.5 rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-3 border-t border-theme-subtle">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={uploadLoading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              loading={uploadLoading}
              disabled={!file || !title.trim()}
            >
              Upload Paper
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleArxivSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-theme-main mb-1">
              arXiv ID or URL <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={arxivId}
              onChange={(e) => setArxivId(e.target.value)}
              placeholder="e.g. 1706.03762 or 2301.00001v2"
              className="w-full px-3 py-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl text-theme-main placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              required
            />
            <p className="text-xs text-theme-secondary mt-1.5 font-medium">
              The backend will automatically query the official arXiv Atom API, download the PDF, validate magic bytes, and register the metadata.
            </p>
          </div>

          <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/30 text-amber-300 text-xs space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Direct Ingestion</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Accepts formats like <code className="bg-amber-500/20 px-1 rounded">2301.00001</code>, <code className="bg-amber-500/20 px-1 rounded">1706.03762v2</code>, or full arXiv URLs.
            </p>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-theme-subtle">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={importLoading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              loading={importLoading}
              disabled={!arxivId.trim()}
            >
              Import Paper
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
