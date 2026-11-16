import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  Suspense,
} from 'react';

import { Document, Page, pdfjs } from 'react-pdf';

import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

import {
  FileText,
  AlertCircle,
  RefreshCw,
  Loader2,
  Tag,
  MessageSquare,
} from 'lucide-react';

import FloatingSelectionToolbar from './FloatingSelectionToolbar';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

function PdfSkeletonFallback() {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center my-auto space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-indigo-950/60 border border-indigo-800 flex items-center justify-center text-indigo-400">
        <FileText className="w-8 h-8 animate-pulse" />
      </div>
      <div>
        <p className="text-sm font-bold text-white">Rendering Research Document...</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          Initializing Mozilla PDF.js canvas and interactive text layer.
        </p>
      </div>
      <Loader2 className="w-6 h-6 text-indigo-400 animate-spin mt-2" />
    </div>
  );
}

export default function PdfReader({
  blobUrl,
  loading,
  error,
  onRetry,
  activePage = 1,
  onPageChange,
  numPages = 1,
  setNumPages,
  zoom = 100,
  continuousMode = true,
  annotations = [],
  activeAnnotationId,
  onSelectAnnotation,
  onHighlightSelection,
  onAnnotateSelection,
  onAssignTagSelection,
  searchQuery = '',
  searchResults = [],
  setSearchResults,
  currentMatchIndex = 0,
  setCurrentMatchIndex,
  paperTitle = '',
}) {
  const containerRef = useRef(null);
  const pageRefs = useRef({});
  const pdfDocumentRef = useRef(null);
  const activeExtractionIdRef = useRef(0);
  const textExtractionCacheRef = useRef(new Map());
  const isMountedRef = useRef(true);

  const [floatingToolbar, setFloatingToolbar] = useState(null);
  const [selectedTextData, setSelectedTextData] = useState(null);
  const [pageTextMap, setPageTextMap] = useState({});
  const [renderedPages, setRenderedPages] = useState({});
  const [documentLoadError, setDocumentLoadError] = useState(null);

  // Component mount & unmount lifecycle tracking
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      activeExtractionIdRef.current++;
    };
  }, []);

  // Reset document load error and cancel any active extraction when blob URL changes
  useEffect(() => {
    activeExtractionIdRef.current++;
    setDocumentLoadError(null);
  }, [blobUrl]);

  // Sync activePage into ref to prevent IntersectionObserver teardown cycles
  const activePageRef = useRef(activePage);
  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);

  // Guard against scroll vs intersection observer feedback loop
  const isProgrammaticScrollRef = useRef(false);
  const programmaticScrollTimerRef = useRef(null);

  const setProgrammaticScroll = useCallback((duration = 700) => {
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) {
      clearTimeout(programmaticScrollTimerRef.current);
    }
    programmaticScrollTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (programmaticScrollTimerRef.current) {
        clearTimeout(programmaticScrollTimerRef.current);
      }
    };
  }, []);

  // ── 1. Document Load Handler (Extract text across all pages with worker cancellation) ──
  const handleDocumentLoadSuccess = useCallback(async (pdfDoc) => {
    if (!pdfDoc || !isMountedRef.current) return;
    pdfDocumentRef.current = pdfDoc;

    if (setNumPages) {
      setNumPages((prev) => (prev !== pdfDoc.numPages ? pdfDoc.numPages : prev));
    }

    const currentExtractionId = ++activeExtractionIdRef.current;
    const cacheKey = blobUrl || paperTitle || `doc_${pdfDoc.fingerprints?.[0] || 'default'}`;

    // Check if we already have fully extracted text for this document in cache
    if (textExtractionCacheRef.current.has(cacheKey)) {
      const cachedMap = textExtractionCacheRef.current.get(cacheKey);
      if (cachedMap && Object.keys(cachedMap).length >= pdfDoc.numPages) {
        setPageTextMap(cachedMap);
        return;
      }
    }

    const textMap = textExtractionCacheRef.current.get(cacheKey) || {};

    // Helper to detect if task was cancelled or worker destroyed
    const isCancelled = () =>
      activeExtractionIdRef.current !== currentExtractionId ||
      !isMountedRef.current ||
      pdfDocumentRef.current !== pdfDoc;

    try {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (isCancelled()) break;

        // Skip page if already extracted in cache
        if (textMap[i] && typeof textMap[i] === 'string' && textMap[i].length > 0) {
          continue;
        }

        let page = null;
        try {
          page = await pdfDoc.getPage(i);
          if (isCancelled()) {
            if (page?.cleanup) page.cleanup();
            break;
          }

          const textContent = await page.getTextContent();
          if (isCancelled()) {
            if (page?.cleanup) page.cleanup();
            break;
          }

          const fullPageText = (textContent?.items || [])
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ');

          textMap[i] = fullPageText;

          // Clean up individual page resources in PDF.js worker
          if (page?.cleanup) {
            page.cleanup();
          }
        } catch (pageErr) {
          const isTerminated =
            pageErr?.name === 'RenderingCancelledException' ||
            pageErr?.name === 'AbortException' ||
            pageErr?.message?.includes('terminated') ||
            pageErr?.message?.includes('destroyed') ||
            pageErr?.message?.includes('cancelled');

          if (isTerminated || isCancelled()) {
            break;
          }
          // Gracefully record empty string for an unextractable page and continue
          textMap[i] = '';
        }

        // Progressively commit extracted pages every 4 pages or at document end
        if (i % 4 === 0 || i === pdfDoc.numPages) {
          if (!isCancelled()) {
            textExtractionCacheRef.current.set(cacheKey, { ...textMap });
            setPageTextMap((prev) => ({ ...prev, ...textMap }));
          }
        }

        // Small cooperative yield to browser event loop so canvas rendering takes priority
        if (i % 2 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
      }

      if (!isCancelled()) {
        textExtractionCacheRef.current.set(cacheKey, { ...textMap });
        setPageTextMap({ ...textMap });
      }
    } catch (e) {
      const isTerminated =
        e?.name === 'RenderingCancelledException' ||
        e?.name === 'AbortException' ||
        e?.message?.includes('terminated') ||
        e?.message?.includes('destroyed') ||
        e?.message?.includes('cancelled');

      if (!isTerminated && !isCancelled()) {
        console.warn('PDF text extraction error:', e);
      }
    }
  }, [blobUrl, paperTitle, setNumPages]);

  const handleDocumentLoadError = useCallback((err) => {
    console.error('react-pdf document load error:', err);
    setDocumentLoadError(err?.message || 'Failed to render PDF document canvas. Please retry.');
  }, []);

  // ── 2. Full-Text Search Across All Pages ──────────────────────────────────
  useEffect(() => {
    if (!setSearchResults) return;

    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery || Object.keys(pageTextMap).length === 0) {
      setSearchResults([]);
      return;
    }

    const q = trimmedQuery.toLowerCase();
    const results = [];

    for (let p = 1; p <= (numPages || 1); p++) {
      const pageText = pageTextMap[p] || '';
      const lower = pageText.toLowerCase();
      let index = lower.indexOf(q);
      while (index !== -1) {
        results.push({
          matchIndex: results.length,
          pageNumber: p,
          charIndex: index,
          snippet: pageText.slice(Math.max(0, index - 25), index + q.length + 35),
        });
        index = lower.indexOf(q, index + q.length);
      }
    }

    setSearchResults(results);
  }, [searchQuery, pageTextMap, numPages, setSearchResults]);

  // ── 3. DOM Text Layer Search Highlighting ─────────────────────────────────
  const highlightSearchMatchesInDom = useCallback(() => {
    if (!containerRef.current) return;

    const trimmedQuery = searchQuery.trim();

    // 1. First, clear all previous highlights across the container
    const existingMarks = containerRef.current.querySelectorAll('mark.pdf-search-highlight');
    existingMarks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
      }
    });

    if (!trimmedQuery) return;

    // 2. Walk all page textLayer spans and highlight matching occurrences
    const escaped = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');

    const pageContainers = containerRef.current.querySelectorAll('[data-page-number]');
    const sortedPages = Array.from(pageContainers).sort((a, b) => {
      const numA = parseInt(a.getAttribute('data-page-number'), 10) || 0;
      const numB = parseInt(b.getAttribute('data-page-number'), 10) || 0;
      return numA - numB;
    });

    sortedPages.forEach((pageEl) => {
      const pageNum = parseInt(pageEl.getAttribute('data-page-number'), 10);
      const textLayer = pageEl.querySelector('.react-pdf__Page__textContent, .textLayer');
      if (!textLayer) return;

      const matchesBeforePage = (searchResults || []).filter(
        (m) => m.pageNumber < pageNum
      ).length;
      let pageMatchCounter = matchesBeforePage;

      const spans = textLayer.querySelectorAll('span');
      spans.forEach((span) => {
        // Save initial raw text
        if (!span.dataset.rawText) {
          span.dataset.rawText = span.textContent;
        }

        const raw = span.dataset.rawText;
        if (!raw || !regex.test(raw)) return;

        regex.lastIndex = 0;
        span.innerHTML = raw.replace(regex, (matched) => {
          const matchIdx = pageMatchCounter++;
          const isActive = matchIdx === currentMatchIndex;
          return `<mark class="pdf-search-highlight ${
            isActive ? 'pdf-search-highlight-active' : ''
          }" data-match-idx="${matchIdx}" data-page="${pageNum}">${matched}</mark>`;
        });
      });
    });

    // 3. Scroll and center active search match
    const activeMark = containerRef.current.querySelector('.pdf-search-highlight-active');
    if (activeMark) {
      setProgrammaticScroll(600);
      activeMark.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }, [searchQuery, searchResults, currentMatchIndex, setProgrammaticScroll]);

  // Re-run highlighting on query or match index change, or when pages finish rendering
  useEffect(() => {
    // Delay slightly to ensure PDF.js textLayer span elements are in the DOM
    const timer = setTimeout(() => {
      highlightSearchMatchesInDom();
    }, 60);
    return () => clearTimeout(timer);
  }, [searchQuery, searchResults, currentMatchIndex, renderedPages, highlightSearchMatchesInDom]);

  // Click on any match highlight to make it the active match
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMarkClick = (e) => {
      const mark = e.target.closest('.pdf-search-highlight');
      if (mark && setCurrentMatchIndex) {
        const idx = parseInt(mark.getAttribute('data-match-idx'), 10);
        if (!isNaN(idx)) {
          setCurrentMatchIndex(idx);
        }
      }
    };

    container.addEventListener('click', handleMarkClick);
    return () => container.removeEventListener('click', handleMarkClick);
  }, [setCurrentMatchIndex]);

  // ── 4. Scroll to Active Page from Toolbar ─────────────────────────────────
  useEffect(() => {
    if (continuousMode && pageRefs.current[activePage]) {
      const el = pageRefs.current[activePage];
      const rect = el.getBoundingClientRect();
      const parentRect = containerRef.current?.getBoundingClientRect();
      if (
        parentRect &&
        (rect.top < parentRect.top - 100 || rect.bottom > parentRect.bottom + 100)
      ) {
        setProgrammaticScroll(700);
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [activePage, continuousMode, setProgrammaticScroll]);

  // ── 5. Scroll to Active Annotation Highlight ──────────────────────────────
  useEffect(() => {
    if (!activeAnnotationId) return;
    setProgrammaticScroll(700);
    const highlightEl = document.getElementById(`highlight-${activeAnnotationId}`);
    if (highlightEl) {
      highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const target = annotations.find((a) => a.id === activeAnnotationId);
      if (target && pageRefs.current[target.page_number]) {
        pageRefs.current[target.page_number].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [activeAnnotationId, annotations, setProgrammaticScroll]);

  // ── 6. Text Selection & Floating Toolbar Positioning ─────────────────────
  const recalculateSelectionToolbar = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setFloatingToolbar(null);
      setSelectedTextData(null);
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length < 2) {
      setFloatingToolbar(null);
      setSelectedTextData(null);
      return;
    }

    // Ensure selection is inside the PDF viewer container
    if (containerRef.current && !containerRef.current.contains(selection.anchorNode)) {
      setFloatingToolbar(null);
      return;
    }

    // Identify the PDF page container
    const anchor = selection.anchorNode;
    const pageContainer = anchor?.parentElement?.closest('[data-page-number]');
    if (!pageContainer) {
      setFloatingToolbar(null);
      return;
    }

    const pageNumber = parseInt(pageContainer.getAttribute('data-page-number'), 10);
    if (!pageNumber || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const pageRect = pageContainer.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      setFloatingToolbar(null);
      return;
    }

    // Calculate normalized coordinates relative to page (0 to 1, 5 decimal precision)
    const position_x = parseFloat(
      Math.max(0, Math.min(1, (rect.left - pageRect.left) / pageRect.width)).toFixed(5)
    );
    const position_y = parseFloat(
      Math.max(0, Math.min(1, (rect.top - pageRect.top) / pageRect.height)).toFixed(5)
    );
    const region_width = parseFloat(
      Math.max(0.01, Math.min(1, rect.width / pageRect.width)).toFixed(5)
    );
    const region_height = parseFloat(
      Math.max(0.01, Math.min(1, rect.height / pageRect.height)).toFixed(5)
    );

    const selectionPayload = {
      text,
      pageNumber,
      position_x,
      position_y,
      region_width,
      region_height,
    };

    setSelectedTextData(selectionPayload);

    // Toolbar dimensions and viewport clamping
    const toolbarWidth = 390;
    const toolbarHeight = 44;
    const padding = 12;
    const gap = 8;

    // Horizontal centering relative to selection rect
    let left = rect.left + rect.width / 2 - toolbarWidth / 2;
    if (left < padding) left = padding;
    if (left + toolbarWidth > window.innerWidth - padding) {
      left = window.innerWidth - toolbarWidth - padding;
    }

    // Vertical positioning: immediately above if sufficient space; otherwise below
    let top;
    if (rect.top >= toolbarHeight + gap + padding) {
      top = rect.top - toolbarHeight - gap;
    } else {
      top = rect.bottom + gap;
    }

    // Ensure toolbar stays within vertical viewport boundaries
    if (top < padding) top = padding;
    if (top + toolbarHeight > window.innerHeight - padding) {
      top = window.innerHeight - toolbarHeight - padding;
    }

    setFloatingToolbar({ top, left });
  }, []);

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      recalculateSelectionToolbar();
    }, 20);
  }, [recalculateSelectionToolbar]);

  // Recalculate position on scroll (container and window) and window resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleReposition = () => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) {
        recalculateSelectionToolbar();
      }
    };

    container.addEventListener('scroll', handleReposition, { passive: true });
    window.addEventListener('scroll', handleReposition, { passive: true });
    window.addEventListener('resize', handleReposition, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleReposition);
      window.removeEventListener('scroll', handleReposition);
      window.removeEventListener('resize', handleReposition);
    };
  }, [recalculateSelectionToolbar]);

  const handleDismissSelection = useCallback(() => {
    setFloatingToolbar(null);
    setSelectedTextData(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleQuickHighlight = useCallback((data) => {
    onHighlightSelection && onHighlightSelection(data);
    handleDismissSelection();
  }, [onHighlightSelection, handleDismissSelection]);

  const handleAnnotate = useCallback((data) => {
    onAnnotateSelection && onAnnotateSelection(data);
    handleDismissSelection();
  }, [onAnnotateSelection, handleDismissSelection]);

  const handleAssignTag = useCallback((data) => {
    onAssignTagSelection && onAssignTagSelection(data);
    handleDismissSelection();
  }, [onAssignTagSelection, handleDismissSelection]);

  // ── 7. Intersection Observer for Continuous Scroll ────────────────────────
  useEffect(() => {
    if (!continuousMode || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScrollRef.current) return;

        let bestPageNum = null;
        let bestRatio = 0;

        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            const pageNum = parseInt(entry.target.getAttribute('data-page-number'), 10);
            if (!isNaN(pageNum)) {
              bestRatio = entry.intersectionRatio;
              bestPageNum = pageNum;
            }
          }
        }

        if (bestPageNum && bestPageNum !== activePageRef.current) {
          activePageRef.current = bestPageNum;
          onPageChange && onPageChange(bestPageNum);
        }
      },
      {
        root: containerRef.current,
        threshold: [0.1, 0.3, 0.5, 0.7],
      }
    );

    const elements = containerRef.current.querySelectorAll('[data-page-number]');
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [continuousMode, numPages, onPageChange]);

  const scale = zoom / 100;

  // Stable file prop object for react-pdf to prevent evictions
  const fileProp = useMemo(() => {
    return blobUrl ? { url: blobUrl } : null;
  }, [blobUrl]);

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      className="flex-1 bg-slate-950 overflow-y-auto overflow-x-auto relative flex flex-col items-center select-text p-4 min-h-[500px]"
      tabIndex={0}
    >
      {/* Search Highlighting Styles */}
      <style>{`
        mark.pdf-search-highlight {
          background-color: rgba(253, 224, 71, 0.65) !important;
          color: #000000 !important;
          border-bottom: 2px solid #ca8a04 !important;
          border-radius: 2px !important;
          padding: 0 1px !important;
          cursor: pointer !important;
          transition: background-color 0.15s ease-in-out;
        }
        mark.pdf-search-highlight:hover {
          background-color: rgba(250, 204, 21, 0.9) !important;
        }
        mark.pdf-search-highlight-active {
          background-color: rgba(249, 115, 22, 0.95) !important;
          color: #ffffff !important;
          border: 2px solid #c2410c !important;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.5), 0 2px 4px rgba(0,0,0,0.3) !important;
          border-radius: 3px !important;
          font-weight: bold !important;
          animation: pulseMatch 1.5s infinite;
        }
        @keyframes pulseMatch {
          0%, 100% {
            box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.5);
          }
          50% {
            box-shadow: 0 0 0 6px rgba(249, 115, 22, 0.7);
          }
        }
      `}</style>

      {/* Loading Skeleton */}
      {loading && <PdfSkeletonFallback />}

      {/* Error State */}
      {!loading && (error || documentLoadError) && (
        <div className="flex flex-col items-center justify-center p-8 text-center max-w-md my-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-950/80 border border-rose-800 text-rose-400 flex items-center justify-center shadow-lg">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Document Stream Error</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{error || documentLoadError}</p>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={() => {
                setDocumentLoadError(null);
                onRetry();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry PDF Load</span>
            </button>
          )}
        </div>
      )}

      {/* Floating Selection Toolbar */}
      {floatingToolbar && selectedTextData && (
        <FloatingSelectionToolbar
          position={floatingToolbar}
          selectionData={selectedTextData}
          onAddAnnotation={handleQuickHighlight}
          onAssignTags={handleAssignTag}
          onCreateNote={handleAnnotate}
          onHighlight={handleQuickHighlight}
          onAnnotate={handleAnnotate}
          onAssignTag={handleAssignTag}
          onClose={handleDismissSelection}
        />
      )}

      {/* PDF Pages Document Container - Wrapped in Local Suspense with suspense={false} */}
      {!loading && !error && fileProp && (
        <Suspense fallback={<PdfSkeletonFallback />}>
          <Document
            file={fileProp}
            suspense={false}
            loading={null}
            onLoadSuccess={handleDocumentLoadSuccess}
            onLoadError={handleDocumentLoadError}
            className="flex flex-col items-center space-y-6"
          >
            {Array.from(
              { length: continuousMode ? numPages || 1 : 1 },
              (_, idx) => {
                const pageNumber = continuousMode ? idx + 1 : activePage;
                const pageAnnotations = annotations.filter(
                  (a) => a.page_number === pageNumber
                );

                return (
                  <div
                    key={`page_${pageNumber}`}
                    ref={(el) => {
                      pageRefs.current[pageNumber] = el;
                    }}
                    data-page-number={pageNumber}
                    className="relative shadow-2xl rounded-sm overflow-hidden bg-white mx-auto border border-slate-700/60 transition-transform duration-100"
                  >
                    {/* React-PDF Page with canvas + text layer */}
                    <Page
                      pageNumber={pageNumber}
                      scale={scale}
                      suspense={false}
                      loading={null}
                      renderTextLayer={true}
                      renderAnnotationLayer={false}
                      className="select-text"
                      onRenderSuccess={() => {
                        setRenderedPages((prev) => ({ ...prev, [pageNumber]: Date.now() }));
                      }}
                    />

                    {/* Highlights Overlay Container */}
                    <div className="absolute inset-0 pointer-events-none z-10">
                      {pageAnnotations.map((ann) => {
                        if (
                          ann.position_x === null ||
                          ann.position_y === null ||
                          ann.region_width === null ||
                          ann.region_height === null
                        ) {
                          return null;
                        }

                        const isFocused = ann.id === activeAnnotationId;

                        return (
                          <div
                            key={ann.id}
                            id={`highlight-${ann.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectAnnotation && onSelectAnnotation(ann);
                            }}
                            style={{
                              position: 'absolute',
                              left: `${ann.position_x * 100}%`,
                              top: `${ann.position_y * 100}%`,
                              width: `${ann.region_width * 100}%`,
                              height: `${ann.region_height * 100}%`,
                            }}
                            className={`pointer-events-auto cursor-pointer rounded-xs transition-all duration-150 ${
                              isFocused
                                ? 'bg-amber-400/50 ring-2 ring-indigo-500 shadow-md shadow-indigo-500/20'
                                : 'bg-amber-300/35 hover:bg-amber-400/50 border-b border-amber-500/60'
                            }`}
                            title={`Annotation: ${ann.content}`}
                          >
                            {isFocused && (
                              <span className="absolute -top-3 -right-3 w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] shadow-sm animate-bounce">
                                <MessageSquare className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Page Footer Label */}
                    <div className="absolute bottom-1 right-2 text-[10px] font-mono font-medium text-slate-400 bg-white/80 px-1 rounded shadow-2xs select-none pointer-events-none">
                      Page {pageNumber}
                    </div>
                  </div>
                );
              }
            )}
          </Document>
        </Suspense>
      )}
    </div>
  );
}
