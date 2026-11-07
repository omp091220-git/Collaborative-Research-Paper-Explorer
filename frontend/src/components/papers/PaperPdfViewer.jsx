import { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  FileQuestion,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import Button from '../common/Button';
import api, { getApiErrorMessage } from '../../services/api';

export default function PaperPdfViewer({
  paperId,
  paper,
  pdfUrl,
  className = '',
}) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  // Compute the endpoint to fetch the PDF from
  const targetUrl = pdfUrl || (paperId ? `/papers/${paperId}/pdf` : null);

  const loadPdf = async () => {
    if (!targetUrl && !paper?.arxiv_id) {
      setLoading(false);
      setError('No PDF document is attached to this research paper.');
      setErrorCode('NO_PDF');
      return;
    }

    setLoading(true);
    setError(null);
    setErrorCode(null);

    // Revoke previous blob if any
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }

    try {
      if (targetUrl) {
        const response = await api.get(targetUrl, {
          responseType: 'blob',
        });

        const contentType = response.headers['content-type'] || '';
        // Verify response is a valid blob
        if (response.data && response.data.size > 0) {
          const url = URL.createObjectURL(response.data);
          setBlobUrl(url);
          setLoading(false);
          return;
        }
      }

      // If backend targetUrl wasn't available but arxiv_id is present
      if (paper?.arxiv_id) {
        setBlobUrl(`https://arxiv.org/pdf/${paper.arxiv_id}.pdf`);
        setLoading(false);
        return;
      }

      throw new Error('PDF file could not be retrieved from the server.');
    } catch (err) {
      console.warn('PDF fetch warning:', err);
      const status = err.response?.status;
      setErrorCode(status);

      if (status === 401) {
        setError('Authentication required to view this research PDF. Please sign in again.');
      } else if (status === 403) {
        setError('You do not have permission to view or download this private research paper.');
      } else if (status === 404) {
        // Fallback to arXiv direct link if arxiv_id exists
        if (paper?.arxiv_id) {
          setBlobUrl(`https://arxiv.org/pdf/${paper.arxiv_id}.pdf`);
          setLoading(false);
          return;
        }
        setError('The requested PDF file is unavailable on the storage volume.');
      } else {
        if (paper?.arxiv_id) {
          // Fallback to direct arXiv link
          setBlobUrl(`https://arxiv.org/pdf/${paper.arxiv_id}.pdf`);
          setLoading(false);
          return;
        }
        setError(getApiErrorMessage(err, 'Failed to stream and render the research PDF.'));
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPdf();
    return () => {
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [paperId, targetUrl]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.error('Fullscreen toggle error:', e);
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(200, z + 25));
  const handleZoomOut = () => setZoom((z) => Math.max(50, z - 25));
  const handleResetZoom = () => setZoom(100);

  const downloadFilename = (paper?.title || 'research_paper')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .slice(0, 60) + '.pdf';

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-slate-900 rounded-2xl border border-slate-700/80 overflow-hidden shadow-xl transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : 'h-[750px] w-full'
      } ${className}`}
    >
      {/* PDF Controls Toolbar */}
      <div className="h-14 bg-slate-950 px-4 flex items-center justify-between gap-3 border-b border-slate-800 text-slate-200 select-none shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-white truncate max-w-xs sm:max-w-md">
              {paper?.title || 'PDF Document Viewer'}
            </h4>
            <p className="text-[10px] text-slate-400 font-medium truncate">
              {paper?.authors
                ? typeof paper.authors === 'string'
                  ? paper.authors
                  : paper.authors.join(', ')
                : 'Research Pre-print'}
            </p>
          </div>
        </div>

        {/* Toolbar actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-900 border border-slate-800 px-1.5 py-1 rounded-lg">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={loading || Boolean(error) || zoom <= 50}
              className="p-1 text-slate-400 hover:text-white disabled:opacity-40 rounded hover:bg-slate-800 transition cursor-pointer"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-slate-300 w-11 text-center font-medium">
              {zoom}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={loading || Boolean(error) || zoom >= 200}
              className="p-1 text-slate-400 hover:text-white disabled:opacity-40 rounded hover:bg-slate-800 transition cursor-pointer"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              disabled={loading || Boolean(error) || zoom === 100}
              className="p-1 text-slate-400 hover:text-white disabled:opacity-40 rounded hover:bg-slate-800 transition cursor-pointer"
              title="Reset zoom"
              aria-label="Reset zoom"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          {/* Download button */}
          {blobUrl && (
            <a
              href={blobUrl}
              download={downloadFilename}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition"
              title="Download PDF file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Download</span>
            </a>
          )}

          {/* Open in external tab */}
          {blobUrl && (
            <a
              href={blobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="Open PDF in new browser tab"
              aria-label="Open PDF in new browser tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
            title={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Main Viewer Body */}
      <div className="flex-1 bg-slate-950 relative overflow-auto flex items-center justify-center min-h-0">
        {/* Loading state skeleton */}
        {loading && (
          <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-indigo-950/60 border border-indigo-800 flex items-center justify-center text-indigo-400">
                <FileText className="w-8 h-8 animate-pulse" />
              </div>
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin absolute -bottom-2 -right-2" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Loading Research Document...</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Authenticating session and streaming PDF stream into high-performance viewport.
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center p-8 text-center max-w-md space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-950/80 border border-rose-800/80 text-rose-400 flex items-center justify-center shadow-lg">
              {errorCode === 403 ? (
                <ShieldAlert className="w-7 h-7" />
              ) : errorCode === 'NO_PDF' ? (
                <FileQuestion className="w-7 h-7" />
              ) : (
                <AlertCircle className="w-7 h-7" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {errorCode === 403
                  ? 'Access Restricted'
                  : errorCode === 'NO_PDF'
                  ? 'No PDF Attached'
                  : 'PDF Stream Error'}
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{error}</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={loadPdf}
                iconLeft={RefreshCw}
                className="gap-1.5"
              >
                Retry Request
              </Button>
              {paper?.arxiv_id && (
                <a
                  href={`https://arxiv.org/abs/${paper.arxiv_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>View on arXiv.org</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Successful PDF Stream Viewer */}
        {!loading && !error && blobUrl && (
          <div
            className="w-full h-full flex items-center justify-center overflow-auto p-1 sm:p-2"
            style={{
              transform: zoom !== 100 ? `scale(${zoom / 100})` : 'none',
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out',
            }}
          >
            <iframe
              src={`${blobUrl}#toolbar=1&navpanes=1&statusbar=1`}
              title={`PDF Viewer: ${paper?.title || 'Paper'}`}
              className="w-full h-full rounded-xl bg-white border-0 shadow-2xl"
            />
          </div>
        )}
      </div>
    </div>
  );
}
