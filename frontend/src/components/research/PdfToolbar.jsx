import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  Download,
  Printer,
  Rows,
  Square,
  MoveHorizontal,
  Maximize,
  PanelLeftClose,
  PanelLeft,
  PanelRight,
  MoreVertical,
  ArrowLeft,
  BookOpen,
} from 'lucide-react';

export default function PdfToolbar({
  onBack,
  paper,
  title = '',
  leftSidebarCollapsed = false,
  onToggleLeftSidebar,
  rightSidebarCollapsed = false,
  onToggleRightSidebar,
  activePage = 1,
  numPages = 1,
  onPageChange,
  zoom = 100,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitWidth,
  onFitPage,
  searchQuery = '',
  onSearchChange,
  searchResults = [],
  currentMatchIndex = -1,
  onNextMatch,
  onPrevMatch,
  isFullscreen = false,
  onToggleFullscreen,
  onDownload,
  onPrint,
  continuousMode = true,
  onToggleContinuousMode,
  onOpenDetails,
}) {
  const [pageInput, setPageInput] = useState(String(activePage));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Synchronize internal input value whenever activePage changes externally
  useEffect(() => {
    setPageInput(String(activePage));
  }, [activePage]);

  // Close three-dot menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // Page input validation and submission
  const commitPageChange = () => {
    const max = numPages || 1;
    const parsed = parseInt(pageInput, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.max(1, Math.min(max, parsed));
      if (clamped !== activePage && onPageChange) {
        onPageChange(clamped);
      }
      setPageInput(String(clamped));
    } else {
      setPageInput(String(activePage));
    }
  };

  const handlePageSubmit = (e) => {
    e.preventDefault();
    commitPageChange();
  };

  const handlePageInputChange = (e) => {
    setPageInput(e.target.value);
  };

  return (
    <div className="h-13 bg-slate-900 border-b border-slate-800 text-slate-200 px-3 sm:px-4 flex items-center justify-between gap-2 select-none shrink-0 z-20 relative">
      {/* ── Left Section: Back to Papers | Library Toggle | Paper Title & Badges ── */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer shrink-0 shadow-2xs"
            title="Return to Explore Papers"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to Papers</span>
            <span className="sm:hidden">Back</span>
          </button>
        )}

        <div className="h-4 w-px bg-slate-800 hidden sm:block shrink-0" />

        {onToggleLeftSidebar && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleLeftSidebar();
            }}
            className={`p-1.5 rounded-lg border transition cursor-pointer shrink-0 ${
              leftSidebarCollapsed
                ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                : 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30'
            }`}
            title={leftSidebarCollapsed ? 'Open Paper Library (Left Sidebar)' : 'Collapse Paper Library (Left Sidebar)'}
            aria-label={leftSidebarCollapsed ? 'Open Left Sidebar' : 'Collapse Left Sidebar'}
          >
            {leftSidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        )}

        {/* Paper Title & Badges */}
        <div className="flex items-center gap-2 min-w-0 max-w-[120px] sm:max-w-xs md:max-w-sm lg:max-w-md">
          <h1
            className="text-xs sm:text-sm font-bold text-white truncate"
            title={title || paper?.title}
          >
            {title || paper?.title || 'Research Paper'}
          </h1>
          {paper?.arxiv_id && (
            <span className="hidden xl:inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950/80 text-purple-300 border border-purple-800/80 shrink-0">
              arXiv:{paper.arxiv_id}
            </span>
          )}
        </div>

        {onOpenDetails && (
          <button
            type="button"
            onClick={onOpenDetails}
            className="hidden 2xl:inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition shrink-0"
            title="View Abstract, Metadata & Overview"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>
        )}
      </div>

      {/* ── Center / Right Section: Page Nav, In-PDF Search, Zoom, Actions Menu, Right Panel Toggle ── */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Page navigation */}
        <div className="flex items-center gap-1">
          {/* Previous page button */}
          <button
            type="button"
            onClick={() => onPageChange && onPageChange(Math.max(1, activePage - 1))}
            disabled={activePage <= 1}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
            title="Previous page"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Direct Page Input Form */}
          <form onSubmit={handlePageSubmit} className="flex items-center gap-1">
            <input
              type="text"
              value={pageInput}
              onChange={handlePageInputChange}
              onBlur={commitPageChange}
              aria-label="Page number"
              className="w-10 text-center py-1 text-xs font-mono font-bold bg-slate-800 border border-slate-700 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-xs text-slate-400 font-mono">
              / {numPages || 1}
            </span>
          </form>

          {/* Next page button */}
          <button
            type="button"
            onClick={() => onPageChange && onPageChange(Math.min(numPages || 1, activePage + 1))}
            disabled={activePage >= (numPages || 1)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
            title="Next page"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="h-4 w-px bg-slate-800 mx-0.5 hidden sm:block" />

        {/* View mode toggle: Continuous scroll vs Single page */}
        {onToggleContinuousMode && (
          <button
            type="button"
            onClick={onToggleContinuousMode}
            className={`hidden sm:flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition cursor-pointer ${
              continuousMode
                ? 'bg-indigo-600/30 border-indigo-500/40 text-indigo-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title={continuousMode ? 'Continuous Scroll View' : 'Single Page View'}
          >
            {continuousMode ? <Rows className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            <span className="text-[11px] font-medium hidden md:inline">
              {continuousMode ? 'Scroll' : 'Single'}
            </span>
          </button>
        )}

      {/* ── Section B: In-Document Search ──────────────────────────────────── */}
      {onSearchChange && (
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg overflow-hidden focus-within:border-indigo-500 transition">
              <Search className="w-3.5 h-3.5 text-slate-400 ml-2.5 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) {
                      onPrevMatch && onPrevMatch();
                    } else {
                      onNextMatch && onNextMatch();
                    }
                  }
                }}
                placeholder="Search PDF..."
                className="w-20 sm:w-32 md:w-44 px-2 py-1 text-xs bg-transparent text-white placeholder:text-slate-500 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {searchQuery && searchResults.length > 0 && (
              <div className="flex items-center gap-1 ml-1.5 text-xs text-slate-300 shrink-0">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold border border-slate-700 whitespace-nowrap">
                  {currentMatchIndex + 1}/{searchResults.length}
                </span>
                <button
                  type="button"
                  onClick={onPrevMatch}
                  className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                  title="Previous match (Shift+Enter)"
                  aria-label="Previous match"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onNextMatch}
                  className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                  title="Next match (Enter)"
                  aria-label="Next match"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Section C: Zoom Controls, Fullscreen, Actions Menu ────────────── */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Zoom controls */}
        <div className="flex items-center bg-slate-800/80 border border-slate-700/80 rounded-lg p-0.5">
          <button
            type="button"
            onClick={onZoomOut}
            disabled={zoom <= 50}
            className="p-1 text-slate-300 hover:text-white disabled:opacity-30 rounded hover:bg-slate-700 transition cursor-pointer"
            title="Zoom out (-15%)"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span
            className="text-[11px] font-mono text-slate-200 w-11 text-center font-bold"
            title={`Current zoom: ${zoom}%`}
          >
            {zoom}%
          </span>

          <button
            type="button"
            onClick={onZoomIn}
            disabled={zoom >= 250}
            className="p-1 text-slate-300 hover:text-white disabled:opacity-30 rounded hover:bg-slate-700 transition cursor-pointer"
            title="Zoom in (+15%)"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Fit Width button */}
        {onFitWidth && (
          <button
            type="button"
            onClick={onFitWidth}
            className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition cursor-pointer"
            title="Fit to Width"
            aria-label="Fit to Width"
          >
            <MoveHorizontal className="w-4 h-4" />
          </button>
        )}

        {/* Fit to Page button */}
        {onFitPage && (
          <button
            type="button"
            onClick={onFitPage}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition cursor-pointer"
            title="Fit to Page"
            aria-label="Fit to Page"
          >
            <Maximize className="w-4 h-4" />
          </button>
        )}

        {/* Reset 100% Zoom button */}
        {onResetZoom && (
          <button
            type="button"
            onClick={onResetZoom}
            disabled={zoom === 100}
            className="hidden sm:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition cursor-pointer"
            title="Reset Zoom to 100%"
            aria-label="Reset Zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="h-4 w-px bg-slate-800 mx-0.5 hidden sm:block" />

        {/* Download PDF button */}
        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="hidden md:flex p-1.5 sm:px-2.5 sm:py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition items-center gap-1.5 cursor-pointer text-xs font-semibold"
            title="Download PDF document"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Download</span>
          </button>
        )}

        {/* Fullscreen toggle button */}
        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        )}

        {/* ── Section D: Three-Dot More Actions Menu ──────────────────────── */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              menuOpen
                ? 'bg-slate-800 text-white ring-1 ring-slate-700'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="More actions"
            aria-label="More actions"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1 z-50 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100">
              {/* 1. Fit to Width */}
              {onFitWidth && (
                <button
                  type="button"
                  onClick={() => {
                    onFitWidth();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition cursor-pointer text-left"
                >
                  <MoveHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Fit to Width</span>
                </button>
              )}

              {/* 2. Fit to Page */}
              {onFitPage && (
                <button
                  type="button"
                  onClick={() => {
                    onFitPage();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition cursor-pointer text-left"
                >
                  <Maximize className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Fit to Page</span>
                </button>
              )}

              {/* 3. Reset Zoom */}
              {onResetZoom && (
                <button
                  type="button"
                  onClick={() => {
                    onResetZoom();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition cursor-pointer text-left"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Reset Zoom (100%)</span>
                </button>
              )}

              <div className="h-px bg-slate-800 my-1" />

              {/* 4. Fullscreen */}
              {onToggleFullscreen && (
                <button
                  type="button"
                  onClick={() => {
                    onToggleFullscreen();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition cursor-pointer text-left"
                >
                  {isFullscreen ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Exit Fullscreen</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Enter Fullscreen</span>
                    </>
                  )}
                </button>
              )}

              {/* 5. Download PDF */}
              {onDownload && (
                <button
                  type="button"
                  onClick={() => {
                    onDownload();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition cursor-pointer text-left"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Download PDF</span>
                </button>
              )}

              {/* 6. Print PDF */}
              {onPrint && (
                <button
                  type="button"
                  onClick={() => {
                    onPrint();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition cursor-pointer text-left"
                >
                  <Printer className="w-3.5 h-3.5 text-sky-400" />
                  <span>Print PDF</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Toggle Right Sidebar (Notes / Topics / Paragraphs Panel) */}
        {onToggleRightSidebar && (
          <button
            type="button"
            onClick={onToggleRightSidebar}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              rightSidebarCollapsed
                ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                : 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30'
            }`}
            title={rightSidebarCollapsed ? 'Open Intelligence Panel (Notes, Topics & Paragraphs)' : 'Collapse Intelligence Panel'}
            aria-label={rightSidebarCollapsed ? 'Open Intelligence Panel' : 'Collapse Intelligence Panel'}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
