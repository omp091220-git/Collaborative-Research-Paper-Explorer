import { useState, useEffect, useRef } from 'react';
import { Highlighter, Edit3, Tag, Copy, Check, X } from 'lucide-react';

export default function FloatingSelectionToolbar({
  position,
  selectionData,
  onHighlight,
  onAnnotate,
  onAssignTag,
  onClose,
}) {
  const [copied, setCopied] = useState(false);
  const toolbarRef = useRef(null);
  const [adjustedPos, setAdjustedPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!position) return;
    const padding = 12;
    const toolbarWidth = 340;
    const toolbarHeight = 44;

    let left = position.left - toolbarWidth / 2;
    let top = position.top - toolbarHeight - 10;

    // Prevent off-screen positioning
    if (left < padding) left = padding;
    if (left + toolbarWidth > window.innerWidth - padding) {
      left = window.innerWidth - toolbarWidth - padding;
    }
    if (top < padding) {
      // Show below selection if too close to top
      top = position.bottom ? position.bottom + 10 : position.top + 30;
    }

    setAdjustedPos({ top, left });
  }, [position]);

  const handleCopy = async (e) => {
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
        top: `${adjustedPos.top}px`,
        left: `${adjustedPos.left}px`,
        zIndex: 9999,
      }}
      className="flex items-center gap-1 p-1 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md text-white rounded-xl shadow-2xl border border-slate-700/80 animate-in fade-in zoom-in-95 duration-150 select-none"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Quick Highlight button */}
      <button
        type="button"
        onClick={() => onHighlight(selectionData)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-500/30 transition cursor-pointer"
        title="Quick Highlight this text"
      >
        <Highlighter className="w-3.5 h-3.5 text-amber-400" />
        <span>Highlight</span>
      </button>

      {/* Annotate with Comment button */}
      <button
        type="button"
        onClick={() => onAnnotate(selectionData)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600/30 hover:bg-indigo-600/45 text-indigo-200 border border-indigo-500/30 transition cursor-pointer"
        title="Add research note & comment"
      >
        <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
        <span>Annotate</span>
      </button>

      {/* Assign Topic Tag directly */}
      <button
        type="button"
        onClick={() => onAssignTag(selectionData)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-purple-600/30 hover:bg-purple-600/45 text-purple-200 border border-purple-500/30 transition cursor-pointer"
        title="Assign Hierarchical Topic Tag (FR-11)"
      >
        <Tag className="w-3.5 h-3.5 text-purple-400" />
        <span>Assign Tag</span>
      </button>

      <div className="h-4 w-px bg-slate-700 my-auto mx-0.5" />

      {/* Copy text */}
      <button
        type="button"
        onClick={handleCopy}
        className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        title="Copy selected text"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>

      {/* Dismiss */}
      <button
        type="button"
        onClick={onClose}
        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        title="Cancel selection"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
