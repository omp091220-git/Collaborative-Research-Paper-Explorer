import { useState } from 'react';
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
  Rows,
  Square,
  MoveHorizontal,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';

export default function PdfToolbar({
  leftSidebarCollapsed = false,
  onToggleLeftSidebar,
  activePage,
  numPages,
  onPageChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitWidth,
  onFitPage,
  searchQuery,
  onSearchChange,
  searchResults = [],
  currentMatchIndex = -1,
  onNextMatch,
  onPrevMatch,
  isFullscreen,
  onToggleFullscreen,
  onDownload,
  downloadFilename,
  continuousMode = true,
  onToggleContinuousMode,
  title = '',
}) {
  const [pageInput, setPageInput] = useState(String(activePage));
  const [searchOpen, setSearchOpen] = useState(false);

  const handlePageSubmit = (e) => {
    e.preventDefault();
    const p = parseInt(pageInput, 10);
    if (!isNaN(p) && p >= 1 && p <= (numPages || 1)) {
      onPageChange(p);
    } else {
      setPageInput(String(activePage));
    }
  };

  const handlePageInputChange = (e) => {
    setPageInput(e.target.value);
  };

  return (
    <div className="h-13 bg-slate-900 border-b border-slate-800 text-slate-200 px-3 sm:px-4 flex items-center justify-between gap-2 select-none shrink-0 z-20">
      {/* Left section: Left Sidebar Toggle & Page Navigation */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {onToggleLeftSidebar && (
          <button
            type="button"
            onClick={onToggleLeftSidebar}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              leftSidebarCollapsed
                ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title={leftSidebarCollapsed ? 'Expand Paper Library (Left Sidebar)' : 'Collapse Paper Library (Left Sidebar)'}
            aria-label={leftSidebarCollapsed ? 'Expand Left Sidebar' : 'Collapse Left Sidebar'}
          >
            {leftSidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        )}

        <div className="h-4 w-px bg-slate-800 mx-0.5 hidden sm:block" />

        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, activePage - 1))}
          disabled={activePage <= 1}
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
          title="Previous page"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <form onSubmit={handlePageSubmit} className="flex items-center gap-1">
          <input
            type="text"
            value={pageInput}
            onChange={handlePageInputChange}
            onBlur={handlePageSubmit}
            className="w-10 text-center py-1 text-xs font-mono font-bold bg-slate-800 border border-slate-700 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <span className="text-xs text-slate-400 font-mono">
            / {numPages || 1}
          </span>
        </form>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(numPages || 1, activePage + 1))}
          disabled={activePage >= (numPages || 1)}
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
          title="Next page"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

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
      </div>

      {/* Center section: Search In Document */}
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
              className="w-24 sm:w-36 md:w-48 px-2 py-1 text-xs bg-transparent text-white placeholder:text-slate-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="p-1 text-slate-400 hover:text-white"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {searchQuery && searchResults.length > 0 && (
            <div className="flex items-center gap-1.5 ml-2 text-xs text-slate-300 shrink-0">
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold border border-slate-700 whitespace-nowrap">
                {currentMatchIndex + 1} of {searchResults.length} matches
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

          {searchQuery && searchResults.length === 0 && (
            <span className="text-[11px] text-slate-400 font-medium ml-2 px-2 py-0.5 bg-slate-800/80 rounded border border-slate-700/60 hidden sm:inline">
              No matches found
            </span>
          )}
        </div>
      </div>

      {/* Right section: Zoom, Fullscreen, Download */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Zoom controls */}
        <div className="flex items-center bg-slate-800/80 border border-slate-700/80 rounded-lg p-0.5">
          <button
            type="button"
            onClick={onZoomOut}
            disabled={zoom <= 50}
            className="p-1 text-slate-300 hover:text-white disabled:opacity-30 rounded hover:bg-slate-700 transition cursor-pointer"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-slate-200 w-11 text-center font-bold">
            {zoom}%
          </span>
          <button
            type="button"
            onClick={onZoomIn}
            disabled={zoom >= 250}
            className="p-1 text-slate-300 hover:text-white disabled:opacity-30 rounded hover:bg-slate-700 transition cursor-pointer"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Fit Width */}
        <button
          type="button"
          onClick={onFitWidth}
          className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition cursor-pointer"
          title="Fit to width"
          aria-label="Fit to width"
        >
          <MoveHorizontal className="w-4 h-4" />
        </button>

        {/* Reset 100% */}
        <button
          type="button"
          onClick={onResetZoom}
          disabled={zoom === 100}
          className="hidden sm:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition cursor-pointer"
          title="Reset zoom to 100%"
          aria-label="Reset zoom to 100%"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-800 mx-0.5 hidden sm:block" />

        {/* Download PDF button */}
        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition flex items-center gap-1.5 cursor-pointer text-xs font-semibold"
            title="Download PDF document"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Download</span>
          </button>
        )}

        {/* Fullscreen toggle */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Reader'}
          aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Reader'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
