import { useState, useRef } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { papersService } from '../../services/papers.service';
import { useToast } from '../../context/ToastContext';
import { MAX_PDF_SIZE_BYTES } from '../../utils/constants';
import { formatBytes } from '../../utils/formatters';
import { UploadCloud, FileText, Link2, Check, AlertCircle } from 'lucide-react';

export default function PaperUploadModal({ isOpen, onClose, onPaperUploaded }) {
  const { success, error: showError } = useToast();
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
      const res = await papersService.uploadPaper(formData, (progress) => {
        setUploadProgress(progress);
      });
      success('Paper Uploaded', `"${title.trim()}" was uploaded successfully.`);
      if (onPaperUploaded) onPaperUploaded(res.paper);
      handleClose();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to upload paper.';
      showError('Upload Failed', msg);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleArxivSubmit = async (e) => {
    e.preventDefault();
    if (!arxivId.trim()) {
      showError('arXiv ID Required', 'Please enter a valid arXiv identifier.');
      return;
    }

    setImportLoading(true);
    try {
      const res = await papersService.importArxiv(arxivId.trim());
      success('arXiv Imported', res.message || 'Paper successfully imported from arXiv.');
      if (onPaperUploaded) onPaperUploaded(res.paper);
      handleClose();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to import from arXiv.';
      showError('Import Failed', msg);
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Research Paper"
      description="Upload an academic PDF paper or import directly from arXiv."
      maxWidth="max-w-xl"
    >
      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className={`flex items-center gap-2 pb-3 px-4 text-xs font-semibold border-b-2 transition cursor-pointer ${
            activeTab === 'upload'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
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
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
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
              className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition ${
                file
                  ? 'border-emerald-300 bg-emerald-50/50'
                  : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20'
              }`}
            >
              {file ? (
                <div className="flex items-center gap-3 text-emerald-800">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Check className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold">{file.name}</p>
                    <p className="text-[11px] text-emerald-600">{formatBytes(file.size)}</p>
                  </div>
                </div>
              ) : (
                <>
                  <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-xs font-semibold text-slate-700">
                    Click to browse or drop PDF here
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    PDF files only, up to 30 MB
                  </p>
                </>
              )}
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Paper Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Deep Residual Learning for Image Recognition"
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Authors <span className="text-rose-500">*</span>{' '}
              <span className="text-slate-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              placeholder="e.g. Kaiming He, Xiangyu Zhang, Shaoqing Ren, Jian Sun"
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Abstract <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              placeholder="Enter paper abstract summary..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-y"
            />
          </div>

          {uploadLoading && uploadProgress > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-1.5 rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
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
            <label className="block text-xs font-medium text-slate-700 mb-1">
              arXiv ID or URL <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={arxivId}
              onChange={(e) => setArxivId(e.target.value)}
              placeholder="e.g. 1706.03762 or 2301.00001v2"
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              required
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              The backend will automatically query the official arXiv Atom API, download the PDF, validate magic bytes, and register the metadata.
            </p>
          </div>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>Direct Ingestion</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Accepts formats like <code className="bg-amber-100/80 px-1 rounded">2301.00001</code>, <code className="bg-amber-100/80 px-1 rounded">1706.03762v2</code>, or full arXiv URLs.
            </p>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
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
