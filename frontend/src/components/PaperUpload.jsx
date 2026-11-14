import { useState, useRef } from 'react';
import axios from 'axios';

const MAX_SIZE_BYTES = 31_457_280; // 30 MiB

function StatusBanner({ status }) {
  if (!status) return null;
  const isSuccess = status.type === 'success';
  return (
    <div
      className={`mt-3 p-3 rounded-lg text-sm font-medium flex items-start gap-2 border ${
        isSuccess
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : 'bg-red-50 text-red-800 border-red-200'
      }`}
    >
      <span className="mt-0.5">{isSuccess ? '✓' : '✕'}</span>
      <span>{status.message}</span>
    </div>
  );
}

export default function PaperUpload({ onPaperAdded }) {
  // PDF Upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAbstract, setUploadAbstract] = useState('');
  const [uploadAuthors, setUploadAuthors] = useState('');
  const [uploadDoi, setUploadDoi] = useState('');
  const [uploadYear, setUploadYear] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(null);
  const fileInputRef = useRef(null);

  // arXiv Import state
  const [arxivId, setArxivId] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importStatus, setImportStatus] = useState(null);

  // ── File selection ────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setUploadStatus(null);
    if (!file) return setSelectedFile(null);

    if (file.type !== 'application/pdf') {
      setUploadStatus({ type: 'error', message: 'Only PDF files are accepted.' });
      return setSelectedFile(null);
    }
    if (file.size > MAX_SIZE_BYTES) {
      setUploadStatus({
        type: 'error',
        message: `File is too large. Maximum allowed size is 30 MB (this file is ${(file.size / 1_048_576).toFixed(1)} MB).`,
      });
      return setSelectedFile(null);
    }
    setSelectedFile(file);
  };

  // ── PDF Upload submit ─────────────────────────────────────────────────────
  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadStatus(null);

    if (!selectedFile)
      return setUploadStatus({ type: 'error', message: 'Please select a PDF file.' });
    if (!uploadTitle.trim())
      return setUploadStatus({ type: 'error', message: 'Paper title is required.' });

    const authorsArray = uploadAuthors
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    if (authorsArray.length === 0)
      return setUploadStatus({ type: 'error', message: 'At least one author is required.' });

    // Validate publication year if provided
    if (uploadYear.trim()) {
      const yr = Number(uploadYear);
      if (!Number.isInteger(yr) || yr < 1665 || yr > 2100) {
        return setUploadStatus({
          type: 'error',
          message: 'Publication year must be an integer between 1665 and 2100.',
        });
      }
    }

    const formData = new FormData();
    formData.append('pdf', selectedFile);
    formData.append('title', uploadTitle.trim());
    formData.append('abstract', uploadAbstract.trim());
    formData.append('authors', JSON.stringify(authorsArray));
    if (uploadDoi.trim()) {
      formData.append('doi', uploadDoi.trim());
    }
    if (uploadYear.trim()) {
      formData.append('publication_year', uploadYear.trim());
    }

    setUploadLoading(true);
    setUploadProgress(0);

    try {
      const res = await axios.post('/api/papers/upload', formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            setUploadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
          }
        },
      });

      setUploadStatus({ type: 'success', message: res.data.message || 'Paper uploaded successfully.' });
      setSelectedFile(null);
      setUploadTitle('');
      setUploadAbstract('');
      setUploadAuthors('');
      setUploadDoi('');
      setUploadYear('');
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onPaperAdded) onPaperAdded(res.data.paper);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Upload failed. Please try again.';
      setUploadStatus({ type: 'error', message: msg });
      setUploadProgress(0);
    } finally {
      setUploadLoading(false);
    }
  };

  // ── arXiv Import submit ───────────────────────────────────────────────────
  const handleImport = async (e) => {
    e.preventDefault();
    setImportStatus(null);

    if (!arxivId.trim())
      return setImportStatus({ type: 'error', message: 'Please enter an arXiv ID.' });

    setImportLoading(true);
    try {
      const res = await axios.post(
        '/api/papers/import',
        { arxiv_id: arxivId.trim() },
        { withCredentials: true }
      );
      setImportStatus({ type: 'success', message: res.data.message || 'Paper imported successfully.' });
      setArxivId('');
      if (onPaperAdded) onPaperAdded(res.data.paper);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Import failed. Please try again.';
      setImportStatus({ type: 'error', message: msg });
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <span>📤</span> Add Research Papers
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Upload a PDF file or import a paper directly from arXiv.
        </p>
      </div>

      {/* ── Section 1: PDF Upload ────────────────────────────────────────── */}
      <div className="border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-1.5">
            <span>📂</span> Upload PDF
          </h3>
          <span className="text-xs text-slate-400">PDF upload up to 30 MB</span>
        </div>

        <form onSubmit={handleUpload} className="space-y-3">
          {/* File picker */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="hidden"
              id="pdf-file-input"
            />
            <div className="flex items-center gap-3">
              <label
                htmlFor="pdf-file-input"
                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition duration-200"
              >
                <span>📎</span> Choose PDF File
              </label>
              {selectedFile ? (
                <span className="text-sm text-slate-700 truncate max-w-xs">
                  {selectedFile.name}{' '}
                  <span className="text-slate-400">
                    ({(selectedFile.size / 1_048_576).toFixed(1)} MB)
                  </span>
                </span>
              ) : (
                <span className="text-sm text-slate-400">No file selected</span>
              )}
            </div>
          </div>

          {/* Metadata fields */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Paper Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="e.g. Attention Is All You Need"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-slate-800 placeholder-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Authors <span className="text-red-500">*</span>{' '}
              <span className="font-normal text-slate-400">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={uploadAuthors}
              onChange={(e) => setUploadAuthors(e.target.value)}
              placeholder="e.g. Ashish Vaswani, Noam Shazeer"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-slate-800 placeholder-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Abstract <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              value={uploadAbstract}
              onChange={(e) => setUploadAbstract(e.target.value)}
              placeholder="Paste the abstract here..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-slate-800 placeholder-slate-400 resize-y"
            />
          </div>

          {/* DOI and Publication Year (FR-07 optional metadata) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="upload-doi" className="block text-xs font-medium text-slate-600 mb-1">
                DOI <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="upload-doi"
                type="text"
                value={uploadDoi}
                onChange={(e) => setUploadDoi(e.target.value)}
                placeholder="e.g. 10.1000/182"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-slate-800 placeholder-slate-400"
              />
            </div>

            <div>
              <label htmlFor="upload-year" className="block text-xs font-medium text-slate-600 mb-1">
                Publication Year <span className="text-slate-400">(optional, 1665–2100)</span>
              </label>
              <input
                id="upload-year"
                type="number"
                min="1665"
                max="2100"
                step="1"
                value={uploadYear}
                onChange={(e) => setUploadYear(e.target.value)}
                placeholder="e.g. 2023"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-slate-800 placeholder-slate-400"
              />
            </div>
          </div>

          {/* Upload progress */}
          {uploadLoading && uploadProgress > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Uploading…</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <StatusBanner status={uploadStatus} />

          <button
            type="submit"
            disabled={uploadLoading || !selectedFile}
            className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold shadow-sm transition duration-200 cursor-pointer"
          >
            {uploadLoading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Uploading…
              </>
            ) : (
              <>📤 Upload Paper</>
            )}
          </button>
        </form>
      </div>

      {/* ── Section 2: arXiv Import ──────────────────────────────────────── */}
      <div className="border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-1.5">
          <span>🔗</span> Import by Paper ID
        </h3>

        <form onSubmit={handleImport} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">arXiv ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={arxivId}
                onChange={(e) => {
                  setArxivId(e.target.value);
                  setImportStatus(null);
                }}
                placeholder="e.g. 1706.03762 or 2301.00001v2"
                className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-slate-800 placeholder-slate-400"
              />
              <button
                type="submit"
                disabled={importLoading || !arxivId.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold shadow-sm transition duration-200 cursor-pointer whitespace-nowrap"
              >
                {importLoading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Importing…
                  </>
                ) : (
                  '⬇ Import'
                )}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Fetches metadata and PDF directly from{' '}
              <span className="font-medium">arxiv.org</span>.
            </p>
          </div>

          {importStatus && (
            <div
              className={`p-3 rounded-lg text-sm font-medium flex items-start gap-2 border ${
                importStatus.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}
            >
              <span className="mt-0.5">{importStatus.type === 'success' ? '✓' : '✕'}</span>
              <span>{importStatus.message}</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
