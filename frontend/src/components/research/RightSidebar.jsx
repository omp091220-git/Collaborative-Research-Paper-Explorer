import { useState, useMemo } from 'react';
import {
  MessageSquare,
  Tag,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  FolderTree,
  FolderPlus,
  X,
  Edit2,
  Trash2,
  MapPin,
  ExternalLink,
  SlidersHorizontal,
  Check,
  FileText,
  Quote,
  Code2,
  Sparkles,
} from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import TagTreeItem from '../tags/TagTreeItem';
import ConfirmationDialog from '../common/ConfirmationDialog';
import { formatDate } from '../../utils/formatters';
import MarkdownMathRenderer from './MarkdownMathRenderer';

export default function RightSidebar({
  activeTab = 'annotations', // 'annotations' | 'topics' | 'paragraphs'
  onTabChange,
  isCollapsed = false,
  onToggleCollapse,
  annotations = [],
  activeAnnotationId,
  onSelectAnnotation,
  onEditAnnotation,
  onDeleteAnnotation,
  onOpenTagPickerForAnnotation,
  onRemoveAnnotationTag,
  onCreateManualAnnotation,
  // FR-10 Topic Hierarchy props
  tagTree = [],
  allTags = [],
  selectedTagId,
  onSelectTag,
  onOpenCreateTopicModal,
  onOpenEditTopicModal,
  onDeleteTopic,
  onAssignTagToPaper,
  paperAssignments = [],
  canManageTaxonomy = true,
  isAdmin = false,
  currentUser = null,
  paperUploaderId = null,
  width = 384,
  onSetSplitRatio,
}) {
  const [annotationSearch, setAnnotationSearch] = useState('');
  const [paragraphSearch, setParagraphSearch] = useState('');
  const [topicSearch, setTopicSearch] = useState('');
  const [rawViewMap, setRawViewMap] = useState({});

  const toggleRawView = (id) => {
    setRawViewMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const [expandedMap, setExpandedMap] = useState({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteType, setDeleteType] = useState('annotation'); // 'annotation' | 'paragraph' | 'topic'
  const [isDeleting, setIsDeleting] = useState(false);

  const isStudent = currentUser?.role === 'STUDENT';
  const canDeleteAnnotationItem = (ann) => {
    if (isStudent) return false;
    const isAuthor = Boolean(currentUser?.id && ann?.created_by && ann.created_by === currentUser.id);
    const isPaperOwner = Boolean(currentUser?.id && paperUploaderId && paperUploaderId === currentUser.id);
    return Boolean(isAdmin || isAuthor || isPaperOwner);
  };

  const canEditAnnotationItem = (ann) => {
    if (isStudent) return false;
    const isAuthor = Boolean(currentUser?.id && ann?.created_by && ann.created_by === currentUser.id);
    return Boolean(isAdmin || isAuthor);
  };

  const canRemoveTagAssignment = (assignment, ann) => {
    if (isStudent) return false;
    if (isAdmin) return true;
    if (!currentUser?.id) return false;
    const isPaperOwner = Boolean(paperUploaderId && paperUploaderId === currentUser.id);
    const isAssigner = Boolean(assignment?.assigned_by && assignment.assigned_by === currentUser.id);
    const isAnnotationAuthor = Boolean(ann?.created_by && ann.created_by === currentUser.id);
    return isPaperOwner || isAssigner || isAnnotationAuthor;
  };

  // Map tag assignments by annotation_id for fast lookup
  const assignmentsByAnnotation = useMemo(() => {
    const map = {};
    for (const a of (paperAssignments || [])) {
      if (a?.annotation_id) {
        if (!map[a.annotation_id]) map[a.annotation_id] = [];
        map[a.annotation_id].push(a);
      }
    }
    return map;
  }, [paperAssignments]);

  const handleToggleExpand = (tagId) => {
    setExpandedMap((prev) => ({
      ...prev,
      [tagId]: prev[tagId] !== undefined ? !prev[tagId] : false,
    }));
  };

  const handleExpandAll = () => {
    const next = {};
    const walk = (nodes) => {
      for (const n of (nodes || [])) {
        if (n?.id) next[n.id] = true;
        if (n?.children) walk(n.children);
      }
    };
    walk(tagTree || []);
    setExpandedMap(next);
  };

  const handleCollapseAll = () => {
    const next = {};
    const walk = (nodes) => {
      for (const n of (nodes || [])) {
        if (n?.id) next[n.id] = false;
        if (n?.children) walk(n.children);
      }
    };
    walk(tagTree || []);
    setExpandedMap(next);
  };

  // Filter annotations based on search
  const filteredAnnotations = useMemo(() => {
    const list = annotations || [];
    if (!annotationSearch.trim()) return list;
    const q = annotationSearch.toLowerCase().trim();
    return list.filter(
      (a) =>
        a.content?.toLowerCase().includes(q) ||
        String(a.page_number).includes(q) ||
        assignmentsByAnnotation[a.id]?.some(
          (t) =>
            t.tag_name?.toLowerCase().includes(q) ||
            t.name?.toLowerCase().includes(q)
        )
    );
  }, [annotations, annotationSearch, assignmentsByAnnotation]);

  // List of tagged/saved paragraphs (annotations with topic tags, or created from paragraph selections)
  const taggedParagraphs = useMemo(() => {
    const list = (annotations || []).filter(
      (a) =>
        (assignmentsByAnnotation[a.id] && assignmentsByAnnotation[a.id].length > 0) ||
        a.position_x !== null ||
        a.content?.toLowerCase().startsWith('highlight:') ||
        a.content?.includes('> "')
    );
    const sourceList = list.length > 0 ? list : (annotations || []);

    if (!paragraphSearch.trim()) return sourceList;
    const q = paragraphSearch.toLowerCase().trim();
    return sourceList.filter(
      (a) =>
        a.content?.toLowerCase().includes(q) ||
        String(a.page_number).includes(q) ||
        assignmentsByAnnotation[a.id]?.some(
          (t) =>
            t.tag_name?.toLowerCase().includes(q) ||
            t.name?.toLowerCase().includes(q) ||
            t.canonical_path?.toLowerCase().includes(q) ||
            t.canonicalPath?.toLowerCase().includes(q)
        )
    );
  }, [annotations, assignmentsByAnnotation, paragraphSearch]);

  const savedParagraphs = taggedParagraphs;

  const requestDeleteAnnotation = (ann) => {
    setItemToDelete(ann);
    setDeleteType('annotation');
    setDeleteConfirmOpen(true);
  };

  const requestDeleteParagraph = (ann) => {
    setItemToDelete(ann);
    setDeleteType('paragraph');
    setDeleteConfirmOpen(true);
  };

  const requestDeleteTopic = (tag) => {
    setItemToDelete(tag);
    setDeleteType('topic');
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      if (deleteType === 'annotation' || deleteType === 'paragraph') {
        await onDeleteAnnotation(itemToDelete.id);
      } else if (deleteType === 'topic') {
        await onDeleteTopic(itemToDelete.id);
      }
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isCollapsed) {
    return (
      <div className="w-12 bg-slate-900 border-l border-slate-800 flex flex-col items-center py-4 text-slate-400 shrink-0 select-none">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-2 rounded-lg hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Expand Intelligence Panel"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="h-6 w-px bg-slate-800 my-3" />
        <button
          type="button"
          onClick={() => {
            onTabChange('annotations');
            onToggleCollapse();
          }}
          className="p-2 my-2 rounded-lg hover:text-white hover:bg-slate-800 transition cursor-pointer relative"
          title="Annotations"
        >
          <MessageSquare className="w-4 h-4 text-indigo-400" />
          {annotations.length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-indigo-500" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            onTabChange('topics');
            onToggleCollapse();
          }}
          className="p-2 my-2 rounded-lg hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Topic Tags"
        >
          <Tag className="w-4 h-4 text-purple-400" />
        </button>
        <button
          type="button"
          onClick={() => {
            onTabChange('paragraphs');
            onToggleCollapse();
          }}
          className="p-2 my-2 rounded-lg hover:text-white hover:bg-slate-800 transition cursor-pointer relative"
          title="Paragraph Tags"
        >
          <Quote className="w-4 h-4 text-emerald-400" />
          {taggedParagraphs.length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{ width: `${width}px` }}
      className="bg-slate-900 border-l border-slate-800 text-slate-200 flex flex-col h-full shrink-0 overflow-hidden select-none"
    >
      {/* Tab Navigation Header - 3 Distinct Tabs */}
      <div className="h-13 bg-slate-950 border-b border-slate-800 px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
          {/* Tab 1: Annotations */}
          <button
            type="button"
            onClick={() => onTabChange('annotations')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'annotations'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Notes</span>
            <span className="sm:hidden">Notes</span>
            <span className="ml-0.5 text-[10px] font-mono bg-slate-800/80 px-1 py-0.2 rounded-full">
              {annotations.length}
            </span>
          </button>

          {/* Tab 2: Topic Tags */}
          <button
            type="button"
            onClick={() => onTabChange('topics')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'topics'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Topics</span>
          </button>

          {/* Tab 3: Paragraph Tags */}
          <button
            type="button"
            onClick={() => onTabChange('paragraphs')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'paragraphs'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Quote className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Paragraphs</span>
            <span className="sm:hidden">Paras</span>
            <span className="ml-0.5 text-[10px] font-mono bg-slate-800/80 px-1 py-0.2 rounded-full">
              {taggedParagraphs.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* FR-15 Split Ratio Presets */}
          {onSetSplitRatio && (
            <div className="hidden sm:flex items-center gap-0.5 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-[10px] font-mono">
              <button
                type="button"
                onClick={() => onSetSplitRatio(0.35)}
                className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                title="Split pane: 35% Annotations / 65% PDF"
              >
                35%
              </button>
              <button
                type="button"
                onClick={() => onSetSplitRatio(0.5)}
                className="px-1.5 py-0.5 rounded bg-indigo-950/70 border border-indigo-800/80 hover:bg-indigo-900 text-indigo-300 font-bold transition cursor-pointer"
                title="Split pane: 50/50 Equal Reader & Annotations"
              >
                50/50
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Collapse Panel"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* TAB 1: ANNOTATIONS */}
      {activeTab === 'annotations' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Search & Actions Bar */}
          <div className="p-3 border-b border-slate-800/80 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={annotationSearch}
                  onChange={(e) => setAnnotationSearch(e.target.value)}
                  placeholder="Filter annotations..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
                {annotationSearch && (
                  <button
                    type="button"
                    onClick={() => setAnnotationSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {onCreateManualAnnotation && (
                <button
                  type="button"
                  onClick={onCreateManualAnnotation}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1 cursor-pointer shrink-0 shadow-xs"
                  title="Add annotation remarks"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Add Note</span>
                </button>
              )}
            </div>
          </div>

          {/* Annotations List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {filteredAnnotations.length === 0 ? (
              <div className="text-center py-12 text-slate-400 space-y-2">
                <MessageSquare className="w-8 h-8 mx-auto text-slate-600 stroke-1" />
                <p className="text-xs font-medium">No annotations found</p>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  Select any sentence or paragraph in the PDF to create highlights, notes, and topic tags.
                </p>
              </div>
            ) : (
              filteredAnnotations.map((ann) => {
                const isSelected = ann.id === activeAnnotationId;
                const assignedTags = assignmentsByAnnotation[ann.id] || [];

                return (
                  <div
                    key={ann.id}
                    onClick={() => onSelectAnnotation && onSelectAnnotation(ann)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                      isSelected
                        ? 'bg-slate-800/95 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Header: Page badge, Jump, Edit, Delete */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="primary" size="xs">
                          Page {ann.page_number}
                        </Badge>
                        {ann.position_x !== null && (
                          <span className="text-[10px] font-mono text-slate-400">
                            ({(ann.position_x * 100).toFixed(0)}%, {(ann.position_y * 100).toFixed(0)}%)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleRawView(ann.id)}
                          className={`p-1 rounded transition cursor-pointer ${
                            rawViewMap[ann.id]
                              ? 'text-amber-400 bg-amber-950/60'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800'
                          }`}
                          title={rawViewMap[ann.id] ? 'Show formatted LaTeX/Markdown' : 'View raw syntax'}
                        >
                          <Code2 className="w-3 h-3" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectAnnotation && onSelectAnnotation(ann)}
                          className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition cursor-pointer"
                          title="Scroll to position in PDF"
                        >
                          <MapPin className="w-3 h-3 text-indigo-400" />
                        </button>

                        {onEditAnnotation && canEditAnnotationItem(ann) && (
                          <button
                            type="button"
                            onClick={() => onEditAnnotation(ann)}
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                            title="Edit note"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}

                        {canDeleteAnnotationItem(ann) && (
                          <button
                            type="button"
                            onClick={() => requestDeleteAnnotation(ann)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                            title="Delete note"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Annotation Content (FR-15 Rich LaTeX / Markdown) */}
                    {rawViewMap[ann.id] ? (
                      <pre className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-amber-200/90 whitespace-pre-wrap select-text">
                        {ann.content}
                      </pre>
                    ) : (
                      <div className="text-xs text-slate-200 leading-relaxed font-sans select-text">
                        <MarkdownMathRenderer content={ann.content} />
                      </div>
                    )}

                    {/* Annotation-Level Topic Tags */}
                    <div className="pt-1.5 border-t border-slate-800/80 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {assignedTags.map((assignment) => (
                          <span
                            key={assignment.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-950/80 border border-purple-700/80 text-[10px] font-bold text-purple-200"
                            title={assignment.canonical_path || assignment.canonicalPath || assignment.tag_name}
                          >
                            <Tag className="w-2.5 h-2.5 text-purple-400" />
                            <span>{assignment.tag_name || assignment.name}</span>
                            {canRemoveTagAssignment(assignment, ann) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveAnnotationTag(assignment.id);
                                }}
                                className="hover:text-rose-400 ml-0.5 cursor-pointer"
                                title="Remove tag"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </span>
                        ))}

                        {!isStudent && canManageTaxonomy && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenTagPickerForAnnotation(ann);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[10px] font-semibold transition cursor-pointer"
                            title="Assign topic tag to this annotation (FR-11)"
                          >
                            <Plus className="w-2.5 h-2.5" />
                            <span>Tag</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Creator metadata & Timestamp */}
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                      <div className="flex items-center gap-1 truncate max-w-[200px]">
                        <span className="font-semibold text-slate-300 truncate">
                          {ann.author_name || (currentUser?.id === ann.created_by ? currentUser?.full_name || 'You' : 'Researcher')}
                        </span>
                        <span>•</span>
                        <span>{formatDate(ann.created_at, { shortMonth: true })}</span>
                      </div>
                      {isSelected && (
                        <span className="text-[10px] text-indigo-400 font-semibold flex items-center gap-1 shrink-0">
                          <Check className="w-3 h-3" /> Selected
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

      {/* TAB 2: TOPICS & TAXONOMY (FR-10) */}
      {activeTab === 'topics' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Topics Toolbar */}
          <div className="p-3 border-b border-slate-800 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={topicSearch}
                  onChange={(e) => setTopicSearch(e.target.value)}
                  placeholder="Search taxonomy..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                />
                {topicSearch && (
                  <button
                    type="button"
                    onClick={() => setTopicSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {canManageTaxonomy && (
                <button
                  type="button"
                  onClick={() => onOpenCreateTopicModal(null)}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition flex items-center gap-1 cursor-pointer shrink-0 shadow-xs"
                  title="Create new root topic"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New Topic</span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Hierarchical Taxonomy Tree</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExpandAll}
                  className="hover:text-purple-300 transition cursor-pointer"
                >
                  Expand all
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleCollapseAll}
                  className="hover:text-purple-300 transition cursor-pointer"
                >
                  Collapse all
                </button>
              </div>
            </div>
          </div>

          {/* Tag Tree Component */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {tagTree.length === 0 ? (
              <div className="text-center py-12 text-slate-400 space-y-2">
                <FolderTree className="w-8 h-8 mx-auto text-slate-600 stroke-1" />
                <p className="text-xs font-medium">Taxonomy empty</p>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  No verified topic tags found. Create your first root topic tag above.
                </p>
              </div>
            ) : (
              tagTree.map((rootNode) => (
                <TagTreeItem
                  key={rootNode.id}
                  node={rootNode}
                  level={0}
                  expandedMap={expandedMap}
                  onToggleExpand={handleToggleExpand}
                  selectedTagId={selectedTagId}
                  onSelectTag={onSelectTag}
                  canManage={canManageTaxonomy}
                  onAddChild={(node) => onOpenCreateTopicModal(node)}
                  onEdit={(node) => onOpenEditTopicModal(node)}
                  onDelete={(node) => requestDeleteTopic(node)}
                  searchQuery={topicSearch}
                  onAssignToPaper={onAssignTagToPaper}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PARAGRAPH TAGS */}
      {activeTab === 'paragraphs' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Paragraph Tags Filter Bar */}
          <div className="p-3 border-b border-slate-800/80 space-y-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={paragraphSearch}
                onChange={(e) => setParagraphSearch(e.target.value)}
                placeholder="Search tagged paragraphs or tags..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
              {paragraphSearch && (
                <button
                  type="button"
                  onClick={() => setParagraphSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
              <span>{taggedParagraphs.length} Tagged Paragraph{taggedParagraphs.length === 1 ? '' : 's'}</span>
              <span className="text-[10px] text-emerald-400 font-mono">FR-11 Granular Tagging</span>
            </div>
          </div>

          {/* Tagged Paragraphs List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {taggedParagraphs.length === 0 ? (
              <div className="text-center py-12 text-slate-400 space-y-3">
                <Quote className="w-8 h-8 mx-auto text-emerald-600/60 stroke-1" />
                <p className="text-xs font-bold text-slate-300">No Tagged Paragraphs Yet</p>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Select any sentence or paragraph in the PDF viewer, then click <strong className="text-purple-400 font-semibold">"Assign Tag"</strong> or <strong className="text-indigo-400 font-semibold">"Add Annotation"</strong> in the floating toolbar to save and tag passages.
                </p>
              </div>
            ) : (
              taggedParagraphs.map((ann) => {
                const isSelected = ann.id === activeAnnotationId;
                const assignedTags = assignmentsByAnnotation[ann.id] || [];

                return (
                  <div
                    key={ann.id}
                    onClick={() => onSelectAnnotation && onSelectAnnotation(ann)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                      isSelected
                        ? 'bg-slate-800/95 border-emerald-500 shadow-md ring-1 ring-emerald-500/50'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Header: Page & Jump */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-800 text-[10px] font-bold text-emerald-300">
                          <FileText className="w-3 h-3" />
                          <span>Page {ann.page_number}</span>
                        </span>
                        {ann.position_x !== null && (
                          <span className="text-[10px] font-mono text-slate-500">
                            ({(ann.position_x * 100).toFixed(0)}%, {(ann.position_y * 100).toFixed(0)}%)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onSelectAnnotation && onSelectAnnotation(ann)}
                          className="px-2 py-0.5 rounded text-emerald-300 bg-emerald-950/60 border border-emerald-800 hover:bg-emerald-900 transition cursor-pointer flex items-center gap-1 text-[11px] font-semibold"
                          title="Jump directly to page and highlight paragraph in PDF"
                        >
                          <MapPin className="w-3 h-3 text-emerald-400" />
                          <span className="text-[10px]">Jump to PDF</span>
                        </button>

                        {onEditAnnotation && canEditAnnotationItem(ann) && (
                          <button
                            type="button"
                            onClick={() => onEditAnnotation(ann)}
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                            title="Edit paragraph annotation text"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}

                        {canDeleteAnnotationItem(ann) && (
                          <button
                            type="button"
                            onClick={() => requestDeleteParagraph(ann)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                            title="Delete paragraph annotation"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Tagged Paragraph Snippet (FR-15 Rich Markdown & LaTeX) */}
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans border-l-2 border-l-emerald-500">
                      <MarkdownMathRenderer content={ann.content} />
                    </div>

                    {/* Assigned Topic Tags */}
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] font-semibold text-slate-400 flex items-center justify-between">
                        <span>Assigned Topic Tags:</span>
                        {!isStudent && canManageTaxonomy && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenTagPickerForAnnotation(ann);
                            }}
                            className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 transition"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add Tag</span>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {assignedTags.map((assignment) => (
                          <span
                            key={assignment.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-950/80 border border-purple-700/80 text-[10px] font-bold text-purple-200"
                            title={assignment.canonical_path || assignment.canonicalPath || assignment.tag_name}
                          >
                            <Tag className="w-2.5 h-2.5 text-purple-400" />
                            <span>{assignment.tag_name || assignment.name}</span>
                            {canRemoveTagAssignment(assignment, ann) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveAnnotationTag(assignment.id);
                                }}
                                className="hover:text-rose-400 ml-0.5 cursor-pointer"
                                title="Remove tag from this paragraph"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                      <span>{formatDate(ann.created_at, { shortMonth: true })}</span>
                      {isSelected && (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <Check className="w-3 h-3" /> Focused in PDF
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

      {/* Confirmation Dialog for Deletions */}
      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        loading={isDeleting}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setItemToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title={
          deleteType === 'annotation'
            ? 'Delete Research Note?'
            : deleteType === 'paragraph'
            ? 'Delete Saved Paragraph?'
            : 'Delete Topic Tag?'
        }
        message={
          deleteType === 'annotation'
            ? 'Are you sure you want to delete this note record from the database? (Safety note: The original PDF document will remain untouched).'
            : deleteType === 'paragraph'
            ? 'Are you sure you want to delete this saved paragraph annotation from the database? (Safety note: The original PDF document will remain completely untouched).'
            : `Are you sure you want to permanently delete the topic tag "${itemToDelete?.name}"?`
        }
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
