import { useState, useEffect, useRef } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import {
  Tag,
  Edit3,
  MessageSquare,
  Quote,
  Check,
  Eye,
  Bold,
  Italic,
  Code,
  List,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import MarkdownMathRenderer from './MarkdownMathRenderer';

export default function CreateAnnotationModal({
  isOpen,
  onClose,
  selectionData = null,
  annotationToEdit = null,
  onSave,
  tagTree = [],
  allTags = [],
  activePage = 1,
  loading = false,
}) {
  const [content, setContent] = useState('');
  const [pageNumber, setPageNumber] = useState(activePage || 1);
  const [attachToEntirePaper, setAttachToEntirePaper] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState('');
  const [error, setError] = useState(null);
  const [editorTab, setEditorTab] = useState('write'); // 'write' | 'preview'
  const [showCheatsheet, setShowCheatsheet] = useState(false);

  const textareaRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setEditorTab('write');
    setShowCheatsheet(false);

    if (annotationToEdit) {
      setContent(annotationToEdit.content || '');
      setPageNumber(annotationToEdit.page_number || 1);
      setAttachToEntirePaper(annotationToEdit.position_x === null && (!annotationToEdit.page_number || annotationToEdit.page_number === 1));
      setSelectedTagId('');
    } else if (selectionData) {
      // New annotation from selected text
      setContent('');
      setPageNumber(selectionData.pageNumber || activePage || 1);
      setAttachToEntirePaper(false);
      setSelectedTagId('');
    } else {
      setContent('');
      setPageNumber(activePage || 1);
      setAttachToEntirePaper(false);
      setSelectedTagId('');
    }
  }, [isOpen, selectionData, annotationToEdit, activePage]);

  // Insert formatting snippet at cursor
  const handleInsertSnippet = (before, after = '', placeholder = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const previousText = textarea.value;

    const selected = previousText.substring(start, end) || placeholder;
    const replacement = `${before}${selected}${after}`;

    const newContent =
      previousText.substring(0, start) + replacement + previousText.substring(end);

    setContent(newContent);

    // Reposition cursor
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + selected.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    // If selectionData exists, content can be either comment or text itself
    let finalContent = content.trim();
    if (!finalContent) {
      if (selectionData?.text) {
        finalContent = selectionData.text;
      } else {
        setError('Please enter your annotation remarks.');
        return;
      }
    } else if (selectionData?.text && !annotationToEdit) {
      // Include quoted context if user provided both
      finalContent = `> "${selectionData.text}"\n\n${finalContent}`;
    }

    const payload = {
      page_number: pageNumber,
      content: finalContent,
      position_x: selectionData?.position_x ?? annotationToEdit?.position_x ?? null,
      position_y: selectionData?.position_y ?? annotationToEdit?.position_y ?? null,
      region_width: selectionData?.region_width ?? annotationToEdit?.region_width ?? null,
      region_height: selectionData?.region_height ?? annotationToEdit?.region_height ?? null,
      tag_id: selectedTagId || null,
    };

    onSave(payload);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={annotationToEdit ? 'Edit Annotation (FR-15 Rich Reader)' : 'Create Research Annotation'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium">
            {error}
          </div>
        )}

        {/* Selected text quote if applicable */}
        {selectionData?.text && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
              <span className="flex items-center gap-1">
                <Quote className="w-3 h-3 text-indigo-500" /> Quoted Text (Page {selectionData.pageNumber})
              </span>
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 italic leading-relaxed line-clamp-3">
              "{selectionData.text}"
            </p>
          </div>
        )}

        {/* Rich Remark Editor with Tabs (Write vs Live Preview) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setEditorTab('write')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  editorTab === 'write'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Edit3 className="w-3 h-3" />
                <span>Write (Markdown / LaTeX)</span>
              </button>
              <button
                type="button"
                onClick={() => setEditorTab('preview')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  editorTab === 'preview'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>Live Preview</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowCheatsheet((prev) => !prev)}
              className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
            >
              <HelpCircle className="w-3 h-3" />
              <span>{showCheatsheet ? 'Hide Math Guide' : 'LaTeX & Math Cheatsheet'}</span>
            </button>
          </div>

          {/* Quick-insert toolbar (Active only in Write mode) */}
          {editorTab === 'write' && (
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
              <button
                type="button"
                onClick={() => handleInsertSnippet('**', '**', 'bold text')}
                className="p-1 px-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-[11px] font-bold cursor-pointer"
                title="Bold (**text**)"
              >
                <span className="font-bold">B</span>
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('*', '*', 'italic text')}
                className="p-1 px-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-[11px] italic cursor-pointer"
                title="Italic (*text*)"
              >
                <span className="italic font-serif">I</span>
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('`', '`', 'code')}
                className="p-1 px-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-[11px] font-mono cursor-pointer"
                title="Inline Code (`code`)"
              >
                &lt;/&gt;
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('> ', '', 'Quoted thought')}
                className="p-1 px-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-[11px] cursor-pointer"
                title="Blockquote (> quote)"
              >
                Quote
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('- ', '', 'Bullet item')}
                className="p-1 px-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-[11px] cursor-pointer"
                title="Bullet List (- item)"
              >
                • List
              </button>

              <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" />

              {/* LaTeX math buttons */}
              <button
                type="button"
                onClick={() => handleInsertSnippet('$', '$', 'E = mc^2')}
                className="p-1 px-2 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-serif font-bold cursor-pointer flex items-center gap-1"
                title="Inline Math ($formula$)"
              >
                <span>$x$</span>
                <span className="text-[10px] font-sans font-normal">Inline</span>
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('$$\n', '\n$$', '\\int_{0}^{\\infty} f(x) dx')}
                className="p-1 px-2 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 text-[11px] font-serif font-bold cursor-pointer flex items-center gap-1"
                title="Block Math ($$formula$$)"
              >
                <span>$$</span>
                <span className="text-[10px] font-sans font-normal">Equation</span>
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('\\frac{', '}{b}', 'a')}
                className="p-1 px-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-[11px] font-serif cursor-pointer"
                title="Fraction (\frac{a}{b})"
              >
                a/b
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('\\sum_{i=1}^{n} ', '', 'x_i')}
                className="p-1 px-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-[11px] font-serif cursor-pointer"
                title="Summation (\sum_{i=1}^n)"
              >
                ∑
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('\\alpha', '', '')}
                className="p-1 px-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-[11px] font-serif cursor-pointer"
                title="Greek Alpha (\alpha)"
              >
                α
              </button>
            </div>
          )}

          {/* Quick LaTeX & Markdown Guide Cheatsheet */}
          {showCheatsheet && (
            <div className="p-3 rounded-xl bg-slate-900 border border-indigo-900/60 text-slate-300 text-[11px] space-y-2">
              <div className="font-bold text-indigo-300 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> FR-15 Rich Annotation Syntax Guide
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-amber-400">$E = mc^2$</span>
                  <p className="text-slate-400 font-sans mt-0.5">Inline equation</p>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-amber-400">$$\int_a^b f(x)dx$$</span>
                  <p className="text-slate-400 font-sans mt-0.5">Centered block equation</p>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-amber-400">\frac&#123;a&#125;&#123;b&#125;, \sqrt&#123;x&#125;</span>
                  <p className="text-slate-400 font-sans mt-0.5">Fractions and square roots</p>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-amber-400">\alpha, \beta, \theta, \sum</span>
                  <p className="text-slate-400 font-sans mt-0.5">Greek letters and operators</p>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-indigo-300">**bold**, *italic*</span>
                  <p className="text-slate-400 font-sans mt-0.5">Text emphasis</p>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-indigo-300">`code`, &gt; quote, - list</span>
                  <p className="text-slate-400 font-sans mt-0.5">Code and block quotes</p>
                </div>
              </div>
            </div>
          )}

          {/* Write Mode Textarea */}
          {editorTab === 'write' ? (
            <textarea
              ref={textareaRef}
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                selectionData?.text
                  ? 'Add remarks with Markdown or LaTeX math (e.g. $E=mc^2$)...'
                  : 'Enter research findings, critique, or formulas (e.g. $f(x) = \\sum x_i$)...'
              }
              className="w-full px-3 py-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono leading-relaxed"
              autoFocus
            />
          ) : (
            /* Live Preview Mode */
            <div className="w-full min-h-[120px] max-h-[240px] overflow-y-auto px-4 py-3 bg-slate-950 rounded-lg border border-slate-800 shadow-inner">
              <MarkdownMathRenderer content={content || '*Type something in the Write tab to see the live preview.*'} />
            </div>
          )}
        </div>

        {/* Optional Page number if manual entry */}
        {!selectionData && (
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
              Attachment Scope
            </label>
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="attachmentScope"
                  checked={!attachToEntirePaper}
                  onChange={() => setAttachToEntirePaper(false)}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-slate-700 dark:text-slate-300 font-medium">Specific Page</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="attachmentScope"
                  checked={attachToEntirePaper}
                  onChange={() => {
                    setAttachToEntirePaper(true);
                    setPageNumber(1);
                  }}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-slate-700 dark:text-slate-300 font-medium">Entire Paper (General Note)</span>
              </label>
            </div>

            {!attachToEntirePaper && (
              <div className="pt-1 flex items-center gap-2">
                <span className="text-xs text-slate-500">Page:</span>
                <input
                  type="number"
                  min="1"
                  value={pageNumber}
                  onChange={(e) => setPageNumber(parseInt(e.target.value, 10) || 1)}
                  className="w-20 px-2.5 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono"
                />
              </div>
            )}
          </div>
        )}

        {/* Optional Topic Tag Assignment (FR-11) */}
        {!annotationToEdit && allTags.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Assign Topic Tag (optional)</span>
            </label>
            <select
              value={selectedTagId}
              onChange={(e) => setSelectedTagId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 font-sans"
            >
              <option value="">(None - No Topic Tag)</option>
              {allTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.canonicalPath ? `${t.canonicalPath} (${t.name})` : t.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Links this annotation to an FR-10 hierarchical taxonomy tag.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <span className="font-semibold text-indigo-400">FR-15</span>
            <span>supports Markdown &amp; LaTeX</span>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={loading}>
              {annotationToEdit ? 'Save Changes' : 'Create Annotation'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
