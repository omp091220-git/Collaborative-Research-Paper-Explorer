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
} from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import TagTreeItem from '../tags/TagTreeItem';
import ConfirmationDialog from '../common/ConfirmationDialog';
import { formatDate } from '../../utils/formatters';

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
}) {
  const [annotationSearch, setAnnotationSearch] = useState('');
  const [paragraphSearch, setParagraphSearch] = useState('');
  const [topicSearch, setTopicSearch] = useState('');
  const [expandedMap, setExpandedMap] = useState({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteType, setDeleteType] = useState('annotation'); // 'annotation' | 'topic'

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

  // List of tagged paragraphs (annotations with at least one tag assignment)
  const taggedParagraphs = useMemo(() => {
    const list = (annotations || []).filter(
      (a) => assignmentsByAnnotation[a.id] && assignmentsByAnnotation[a.id].length > 0
    );
    if (!paragraphSearch.trim()) return list;
    const q = paragraphSearch.toLowerCase().trim();
    return list.filter(
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

  const requestDeleteAnnotation = (ann) => {
    setItemToDelete(ann);
    setDeleteType('annotation');
    setDeleteConfirmOpen(true);
  };

  const requestDeleteTopic = (tag) => {
    setItemToDelete(tag);
    setDeleteType('topic');
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (deleteType === 'annotation') {
        await onDeleteAnnotation(itemToDelete.id);
      } else if (deleteType === 'topic') {
        await onDeleteTopic(itemToDelete.id);
      }
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
    } catch (err) {
      console.error('Delete error:', err);
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
    <div className="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 text-slate-200 flex flex-col h-full shrink-0 overflow-hidden select-none">
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

        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Collapse Panel"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
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
                          onClick={() => onSelectAnnotation && onSelectAnnotation(ann)}
                          className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition cursor-pointer"
                          title="Scroll to position in PDF"
                        >
                          <MapPin className="w-3 h-3 text-indigo-400" />
                        </button>

                        {onEditAnnotation && (
                          <button
                            type="button"
                            onClick={() => onEditAnnotation(ann)}
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                            title="Edit comment"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => requestDeleteAnnotation(ann)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                            title="Delete annotation"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Annotation Content */}
                    <p className="text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                      {ann.content}
                    </p>

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
                          </span>
                        ))}

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
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                      <span>{formatDate(ann.created_at, { shortMonth: true })}</span>
                      {isSelected && (
                        <span className="text-[10px] text-indigo-400 font-semibold flex items-center gap-1">
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
                  Select any sentence or paragraph in the PDF viewer, then click <strong className="text-purple-400 font-semibold">"Assign Tag"</strong> in the floating toolbar to attach hierarchical topics directly to text passages.
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
                          className="p-1 rounded text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition cursor-pointer flex items-center gap-1 text-[11px] font-semibold"
                          title="Jump to highlight in PDF"
                        >
                          <MapPin className="w-3 h-3 text-emerald-400" />
                          <span className="text-[10px]">Jump</span>
                        </button>
                      </div>
                    </div>

                    {/* Tagged Paragraph Snippet */}
                    <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans italic border-l-2 border-l-emerald-500">
                      "{ann.content}"
                    </div>

                    {/* Assigned Topic Tags */}
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] font-semibold text-slate-400 flex items-center justify-between">
                        <span>Assigned Topic Tags:</span>
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
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title={
          deleteType === 'annotation'
            ? 'Delete Research Annotation?'
            : 'Delete Topic Tag?'
        }
        message={
          deleteType === 'annotation'
            ? 'Are you sure you want to delete this annotation and all its linked topic tags? This action cannot be undone.'
            : `Are you sure you want to permanently delete the topic tag "${itemToDelete?.name}"?`
        }
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
