import { useState, useRef } from 'react';
import { Highlighter, Edit3, Tag, Copy, Check, X } from 'lucide-react';

export default function FloatingSelectionToolbar({
  position,
  selectionData,
  onAddAnnotation,
  onAssignTags,
  onCreateNote,
  onClose,
}) {
  const [copied, setCopied] = useState(false);
  const toolbarRef = useRef(null);

  const handleCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectionData?.text) {
      try {
        await navigator.clipboard.writeText(selectionData.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.warn('Clipboard write error:', err);
      }
    }
  };

  if (!position || !selectionData) return null;

  return (
    <div
      ref={toolbarRef}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 9999,
      }}
      className="flex items-center gap-1 p-1 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md text-white rounded-xl shadow-2xl border border-slate-700/80 animate-in fade-in zoom-in-95 duration-150 select-none pointer-events-auto"
      onMouseDown={(e) => {
        // Prevent selection collapse on click
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Action 1: Add Annotation */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onAddAnnotation) onAddAnnotation(selectionData);
        }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-500/30 transition cursor-pointer whitespace-nowrap"
        title="Add research highlight annotation"
        aria-label="Add Annotation"
      >
        <Highlighter className="w-3.5 h-3.5 text-amber-400" />
        <span>Add Annotation</span>
      </button>

      {/* Action 2: Assign Tags */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onAssignTags) onAssignTags(selectionData);
        }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-purple-600/30 hover:bg-purple-600/45 text-purple-200 border border-purple-500/30 transition cursor-pointer whitespace-nowrap"
        title="Assign Hierarchical Topic Tags (FR-11)"
        aria-label="Assign Tags"
      >
        <Tag className="w-3.5 h-3.5 text-purple-400" />
        <span>Assign Tags</span>
      </button>

      {/* Action 3: Create Note */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onCreateNote) onCreateNote(selectionData);
        }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600/30 hover:bg-indigo-600/45 text-indigo-200 border border-indigo-500/30 transition cursor-pointer whitespace-nowrap"
        title="Create research note with Markdown & LaTeX"
        aria-label="Create Note"
      >
        <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
        <span>Create Note</span>
      </button>

      <div className="h-4 w-px bg-slate-700 my-auto mx-0.5" />

      {/* Copy text */}
      <button
        type="button"
        onClick={handleCopy}
        className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        title="Copy selected text"
        aria-label="Copy text"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Dismiss / Close */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onClose) onClose();
        }}
        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        title="Dismiss toolbar"
        aria-label="Dismiss selection"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
