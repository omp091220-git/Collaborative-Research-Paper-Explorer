import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Tag,
  Plus,
  X,
  Search,
  Library,
  User,
  CheckCircle2,
  ListOrdered,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Badge from '../common/Badge';
import { formatDate } from '../../utils/formatters';

export default function LeftSidebar({
  paper = {},
  papers = [],
  loadingPapers = false,
  onSelectPaper,
  totalPages = 1,
  paperAssignments = [],
  annotations = [],
  onOpenTagPickerForPaper,
  onRemovePaperTag,
  onJumpToAnnotation,
  activeAnnotationId,
  isCollapsed = false,
  onToggleCollapse,
  canAssignTags = true,
}) {
  const [activeTab, setActiveTab] = useState('library'); // 'library' | 'details'
  const [librarySearch, setLibrarySearch] = useState('');
  const [abstractExpanded, setAbstractExpanded] = useState(false);
  const [tagsSectionOpen, setTagsSectionOpen] = useState(true);
  const [outlineSectionOpen, setOutlineSectionOpen] = useState(true);

  // Filter paper-level tag assignments for the current paper
  const paperTags = useMemo(() => {
    return (paperAssignments || []).filter((a) => !a.annotation_id);
  }, [paperAssignments]);

  // Group annotations by page
  const sortedAnnotations = useMemo(() => {
    return (annotations || []).slice().sort(
      (a, b) => (a.page_number || 1) - (b.page_number || 1)
    );
  }, [annotations]);

  // Filter library papers by search term
  const filteredPapers = useMemo(() => {
    if (!librarySearch.trim()) return papers || [];
    const q = librarySearch.toLowerCase().trim();
    return (papers || []).filter((p) => {
      const matchTitle = p.title?.toLowerCase().includes(q);
      const matchArxiv = p.arxiv_id?.toLowerCase().includes(q);
      const matchYear = p.publication_year ? String(p.publication_year).includes(q) : false;
      const matchAuthor = Array.isArray(p.authors)
        ? p.authors.some((a) => a.toLowerCase().includes(q))
        : typeof p.authors === 'string'
        ? p.authors.toLowerCase().includes(q)
        : false;
      const matchTag = p.tags?.some((t) => t.name?.toLowerCase().includes(q));
      return matchTitle || matchArxiv || matchYear || matchAuthor || matchTag;
    });
  }, [papers, librarySearch]);

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleCollapse) onToggleCollapse();
  };

  return (
    <aside
      className={`bg-slate-900 border-r border-slate-800 text-slate-200 flex flex-col h-full shrink-0 select-none z-20 relative transition-[width] duration-300 ease-in-out overflow-hidden ${
        isCollapsed ? 'w-12' : 'w-72 sm:w-80'
      }`}
      aria-label="Research Workspace Left Sidebar"
    >
      {/* ── Collapsed Vertical Icon Bar ──────────────────────────────── */}
      {isCollapsed ? (
        <div className="w-12 h-full flex flex-col items-center py-3 text-slate-400 shrink-0">
          <button
            type="button"
            onClick={handleToggle}
            className="p-2 rounded-lg hover:text-white hover:bg-slate-800 text-slate-300 transition cursor-pointer"
            title="Expand Left Sidebar (Paper Library & Details)"
            aria-label="Expand Left Sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-800 my-2" />

          {/* Quick tab switcher when collapsed */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveTab('library');
              if (onToggleCollapse) onToggleCollapse();
            }}
            className="p-2 my-1 rounded-lg hover:text-white hover:bg-slate-800 text-indigo-400 transition cursor-pointer"
            title="Switch to Library & Expand"
          >
            <Library className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveTab('details');
              if (onToggleCollapse) onToggleCollapse();
            }}
            className="p-2 my-1 rounded-lg hover:text-white hover:bg-slate-800 text-purple-400 transition cursor-pointer"
            title="Switch to Paper Info & Expand"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          <div className="flex-1 flex items-center justify-center my-4">
            <button
              type="button"
              onClick={handleToggle}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-200 uppercase tracking-widest whitespace-nowrap cursor-pointer transition hover:scale-105"
              style={{ writingMode: 'vertical-rl' }}
              title="Click to expand Paper Library"
            >
              Paper Library
            </button>
          </div>
        </div>
      ) : (
        /* ── Expanded Full Sidebar Content ────────────────────────────── */
        <div className="w-72 sm:w-80 flex flex-col h-full min-w-[18rem] overflow-hidden">
          {/* Header with Navigation and Collapse Toggle */}
          <div className="p-3 border-b border-slate-800 flex items-center justify-between shrink-0">
            <Link
              to="/explore"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white transition"
              title="Return to explore papers"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Explore All Papers</span>
            </Link>
            <button
              type="button"
              onClick={handleToggle}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Collapse Left Sidebar"
              aria-label="Collapse Left Sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Segmented Top Tabs: Library vs Current Paper */}
          <div className="p-2 border-b border-slate-800 bg-slate-950/60 shrink-0">
            <div className="grid grid-cols-2 p-0.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('library')}
                className={`py-1.5 px-2 rounded-md font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'library'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Library className="w-3.5 h-3.5" />
                <span>Library ({papers.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`py-1.5 px-2 rounded-md font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'details'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Paper Info</span>
              </button>
            </div>
          </div>

          {/* Tab 1: Library & Fast Paper Navigation */}
          {activeTab === 'library' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-3 space-y-3">
              {/* Search Papers Input */}
              <div className="relative shrink-0">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Filter papers by title, author, year..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-950/80 border border-slate-700/80 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {librarySearch && (
                  <button
                    type="button"
                    onClick={() => setLibrarySearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                    title="Clear filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Papers Scrollable List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {loadingPapers ? (
                  <div className="text-center py-12 text-xs text-slate-400 space-y-2">
                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p>Loading library papers...</p>
                  </div>
                ) : filteredPapers.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-500 space-y-2">
                    <BookOpen className="w-7 h-7 text-slate-600 mx-auto" />
                    <p className="font-semibold text-slate-400">No papers found</p>
                    <p className="text-[11px]">Try adjusting your search query.</p>
                  </div>
                ) : (
                  filteredPapers.map((p) => {
                    const isSelected = p.id === paper?.id;
                    const authorsText = Array.isArray(p.authors)
                      ? p.authors.join(', ')
                      : p.authors || 'Unknown';
                    const tagCount = p.tags?.length || 0;

                    return (
                      <div
                        key={p.id}
                        onClick={() => onSelectPaper && onSelectPaper(p)}
                        className={`p-2.5 rounded-xl border transition cursor-pointer text-left select-none ${
                          isSelected
                            ? 'bg-indigo-950/80 border-indigo-500 text-white shadow-md'
                            : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5 mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                            {p.arxiv_id ? `arXiv:${p.arxiv_id}` : `ID: ${p.id.slice(0, 8)}`}
                          </span>
                          {isSelected && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-1.5 py-0.2 rounded-full">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Active</span>
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs font-bold leading-snug line-clamp-2 mb-1 text-slate-100">
                          {p.title}
                        </h4>

                        <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                          <User className="w-3 h-3 shrink-0 text-slate-500" />
                          <span>{authorsText}</span>
                        </p>

                        <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                          {p.publication_year ? (
                            <span className="font-mono text-slate-300">Year: {p.publication_year}</span>
                          ) : (
                            <span>{formatDate(p.uploaded_at, { shortMonth: true })}</span>
                          )}

                          {tagCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-purple-300 bg-purple-950/60 border border-purple-800/70 px-1.5 py-0.2 rounded">
                              <Tag className="w-2.5 h-2.5" />
                              <span>{tagCount} {tagCount === 1 ? 'topic' : 'topics'}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Current Paper Metadata & Outline */}
          {activeTab === 'details' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
              {/* Paper Title & Authors */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {paper.arxiv_id && (
                    <Badge variant="purple" size="xs">
                      arXiv:{paper.arxiv_id}
                    </Badge>
                  )}
                  {paper.publication_year && (
                    <Badge variant="gray" size="xs">
                      {paper.publication_year}
                    </Badge>
                  )}
                  <Badge variant="blue" size="xs">
                    {totalPages} {totalPages === 1 ? 'Page' : 'Pages'}
                  </Badge>
                </div>

                <h2 className="text-sm font-extrabold text-white leading-snug">
                  {paper.title || 'Untitled Research Paper'}
                </h2>

                <p className="text-[11px] font-medium text-slate-400">
                  {typeof paper.authors === 'string'
                    ? paper.authors
                    : Array.isArray(paper.authors)
                    ? paper.authors.join(', ')
                    : 'Unknown Authors'}
                </p>

                {paper.doi && (
                  <div className="text-[10px] font-mono text-slate-500 truncate">
                    DOI: {paper.doi}
                  </div>
                )}
              </div>

              {/* Collapsible Abstract Section */}
              {paper.abstract && (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-slate-300 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                      Abstract
                    </span>
                    <button
                      type="button"
                      onClick={() => setAbstractExpanded(!abstractExpanded)}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
                    >
                      {abstractExpanded ? 'Less' : 'More'}
                    </button>
                  </div>
                  <p
                    className={`text-[11px] text-slate-400 leading-relaxed font-sans ${
                      abstractExpanded ? '' : 'line-clamp-4'
                    }`}
                  >
                    {paper.abstract}
                  </p>
                </div>
              )}

              {/* Paper-Level Topic Tags (FR-11) */}
              <div className="space-y-2 border-t border-slate-800/80 pt-4">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setTagsSectionOpen(!tagsSectionOpen)}
                    className="flex items-center gap-1.5 font-bold text-slate-200 text-xs hover:text-white transition cursor-pointer"
                  >
                    {tagsSectionOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <Tag className="w-3.5 h-3.5 text-purple-400" />
                    <span>Paper Topic Tags</span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded-full">
                      {paperTags.length}
                    </span>
                  </button>

                  {canAssignTags && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenTagPickerForPaper) onOpenTagPickerForPaper();
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 transition cursor-pointer"
                      title="Assign Topic Tag to Paper (FR-11)"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Tag Paper</span>
                    </button>
                  )}
                </div>

                {tagsSectionOpen && (
                  <div className="space-y-1.5 pt-1">
                    {paperTags.length === 0 ? (
                      <p className="text-[11px] text-slate-500 italic py-1">
                        No topic tags assigned to this paper yet.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {paperTags.map((assignment) => (
                          <span
                            key={assignment.id}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-purple-950/60 border border-purple-800/80 text-purple-200 text-[11px] font-medium"
                            title={assignment.canonical_path || assignment.canonicalPath || assignment.tag_name}
                          >
                            <span>{assignment.tag_name || assignment.name}</span>
                            {canAssignTags && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onRemovePaperTag) onRemovePaperTag(assignment.id);
                                }}
                                className="hover:text-rose-400 transition cursor-pointer"
                                title="Remove tag from paper"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Annotations Outline / Page Jump List */}
              <div className="space-y-2 border-t border-slate-800/80 pt-4">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setOutlineSectionOpen(!outlineSectionOpen)}
                    className="flex items-center gap-1.5 font-bold text-slate-200 text-xs hover:text-white transition cursor-pointer"
                  >
                    {outlineSectionOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <ListOrdered className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Annotations Outline</span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded-full">
                      {annotations.length}
                    </span>
                  </button>
                </div>

                {outlineSectionOpen && (
                  <div className="space-y-1 pt-1 max-h-56 overflow-y-auto pr-1">
                    {sortedAnnotations.length === 0 ? (
                      <p className="text-[11px] text-slate-500 italic py-1">
                        Select text on the PDF to create highlights and notes.
                      </p>
                    ) : (
                      sortedAnnotations.map((ann) => {
                        const isSelected = ann.id === activeAnnotationId;
                        return (
                          <button
                            key={ann.id}
                            type="button"
                            onClick={() => onJumpToAnnotation && onJumpToAnnotation(ann)}
                            className={`w-full text-left p-2 rounded-lg text-xs transition flex items-start gap-2 cursor-pointer border ${
                              isSelected
                                ? 'bg-indigo-950/80 border-indigo-600 text-indigo-100 shadow-xs'
                                : 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-800/70 text-slate-300'
                            }`}
                          >
                            <span className="shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                              p.{ann.page_number}
                            </span>
                            <span className="truncate flex-1 text-[11px]">
                              {ann.content}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
