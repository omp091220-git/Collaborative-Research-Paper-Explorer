import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderTree,
  Tag,
  Plus,
  RefreshCw,
  Search,
  Edit2,
  Trash2,
  FileText,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import tagsService from '../../services/tags.service';
import { getApiErrorMessage } from '../../services/api';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import ConfirmationDialog from '../../components/common/ConfirmationDialog';
import TagTreeItem from '../../components/tags/TagTreeItem';
import TagFormModal from '../../components/tags/TagFormModal';

export default function TopicTaxonomyPage() {
  const { isAdmin, isResearcher } = useAuth();
  const { addToast } = useToast();

  const canEdit = isAdmin || isResearcher;
  const canDelete = isAdmin; // Backend strictly allows only SYSTEM_ADMIN to delete tags

  // Tree & taxonomy state
  const [tagTree, setTagTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);

  // Expand / collapse map: { [tagId]: boolean }
  const [expandedMap, setExpandedMap] = useState({});

  // Modal states
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formModalMode, setFormModalMode] = useState('create'); // 'create' | 'edit'
  const [modalParentTag, setModalParentTag] = useState(null);
  const [modalTagToEdit, setModalTagToEdit] = useState(null);

  // Delete dialog state
  const [tagToDelete, setTagToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch tag hierarchy from backend
  const fetchTaxonomyTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tree = await tagsService.getTagTree();
      setTagTree(tree || []);

      // Auto-expand root tags by default
      const initialExpanded = {};
      const markExpanded = (nodes) => {
        for (const node of nodes) {
          initialExpanded[node.id] = true;
          if (node.children) markExpanded(node.children);
        }
      };
      markExpanded(tree || []);
      setExpandedMap(initialExpanded);

      // Refresh selected tag details if one is selected
      setSelectedTag((prev) => {
        if (!prev) return null;
        const findNode = (nodes, id) => {
          for (const n of nodes) {
            if (n.id === id) return n;
            if (n.children) {
              const res = findNode(n.children, id);
              if (res) return res;
            }
          }
          return null;
        };
        return findNode(tree || [], prev.id) || null;
      });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to retrieve hierarchical topic taxonomy.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTaxonomyTree();
  }, [fetchTaxonomyTree]);

  // Compute statistics
  const stats = useMemo(() => {
    let total = 0;
    let maxDepth = 0;
    const roots = tagTree.length;

    const countWalk = (nodes, depth = 0) => {
      for (const n of nodes) {
        total++;
        if (depth > maxDepth) maxDepth = depth;
        if (n.children && n.children.length > 0) {
          countWalk(n.children, depth + 1);
        }
      }
    };
    countWalk(tagTree);

    return { total, roots, maxDepth };
  }, [tagTree]);

  // Filter tree nodes if search query is active
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tagTree;
    const q = searchQuery.toLowerCase().trim();

    const filterNode = (node) => {
      const matchSelf =
        node.name.toLowerCase().includes(q) ||
        node.slug.toLowerCase().includes(q) ||
        (node.canonicalPath && node.canonicalPath.toLowerCase().includes(q)) ||
        (node.description && node.description.toLowerCase().includes(q));

      const filteredChildren = (node.children || [])
        .map(filterNode)
        .filter(Boolean);

      if (matchSelf || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }
      return null;
    };

    return tagTree.map(filterNode).filter(Boolean);
  }, [tagTree, searchQuery]);

  // Toggle expand / collapse for a single node
  const handleToggleExpand = (id) => {
    setExpandedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleExpandAll = () => {
    const nextMap = {};
    const walk = (nodes) => {
      for (const n of nodes) {
        nextMap[n.id] = true;
        if (n.children) walk(n.children);
      }
    };
    walk(tagTree);
    setExpandedMap(nextMap);
  };

  const handleCollapseAll = () => {
    const nextMap = {};
    const walk = (nodes) => {
      for (const n of nodes) {
        nextMap[n.id] = false;
        if (n.children) walk(n.children);
      }
    };
    walk(tagTree);
    setExpandedMap(nextMap);
  };

  // Open Create Root Tag modal
  const handleOpenCreateRoot = () => {
    setFormModalMode('create');
    setModalParentTag(null);
    setModalTagToEdit(null);
    setFormModalOpen(true);
  };

  // Open Create Child Tag modal
  const handleOpenAddChild = (parent) => {
    setFormModalMode('create');
    setModalParentTag(parent);
    setModalTagToEdit(null);
    setFormModalOpen(true);
  };

  // Open Edit Tag modal
  const handleOpenEdit = (tag) => {
    setFormModalMode('edit');
    setModalParentTag(null);
    setModalTagToEdit(tag);
    setFormModalOpen(true);
  };

  // Handle successful creation / update from modal
  const handleSavedTag = (tag, action) => {
    addToast({
      type: 'success',
      title: action === 'created' ? 'Tag Created' : 'Tag Updated',
      message: `Topic tag "${tag.name}" has been ${action === 'created' ? 'created' : 'saved'}.`,
    });
    fetchTaxonomyTree();
  };

  // Execute tag deletion
  const handleConfirmDelete = async () => {
    if (!tagToDelete) return;
    setDeleting(true);
    try {
      await tagsService.deleteTag(tagToDelete.id);
      addToast({
        type: 'info',
        title: 'Tag Deleted',
        message: `Topic tag "${tagToDelete.name}" was permanently removed.`,
      });
      if (selectedTag?.id === tagToDelete.id) {
        setSelectedTag(null);
      }
      setTagToDelete(null);
      fetchTaxonomyTree();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Delete Failed',
        message: getApiErrorMessage(err, 'Unable to delete topic tag.'),
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <PageHeader
        title="Hierarchical Topic Taxonomy (FR-10)"
        description="Organize, curate, and explore the research classification taxonomy. Tags form a strict tree of subdomains for multi-level categorization."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/tagging">
              <Button variant="outline" size="sm" iconLeft={Tag} className="gap-1.5">
                <span>Paper Tagging Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>

            {canEdit && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenCreateRoot}
                iconLeft={Plus}
                className="gap-1.5"
              >
                <span>New Root Domain</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={fetchTaxonomyTree}
              disabled={loading}
              iconLeft={RefreshCw}
              className={`p-2 ${loading ? 'animate-spin' : ''}`}
              title="Refresh taxonomy"
              aria-label="Refresh taxonomy"
            />
          </div>
        }
      />

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Total Classified Topics</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.total}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 font-bold">
            <Tag className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Root Domains</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.roots}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 font-bold">
            <FolderTree className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Maximum Subtree Depth</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
              {stats.maxDepth > 0 ? `${stats.maxDepth + 1} Tiers` : '1 Tier'}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Interactive Taxonomy Tree */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 p-5 shadow-xs space-y-4 flex flex-col">
          {/* Search & Tree Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search taxonomy by topic name, slug, or path..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
              <Button variant="ghost" size="xs" onClick={handleExpandAll}>
                Expand All
              </Button>
              <Button variant="ghost" size="xs" onClick={handleCollapseAll}>
                Collapse All
              </Button>
            </div>
          </div>

          {/* Tree Rendering Area */}
          <div className="flex-1 min-h-[350px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-xs text-slate-500 space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                <span>Loading hierarchical taxonomy...</span>
              </div>
            ) : error ? (
              <ErrorState
                title="Failed to load topic taxonomy"
                message={error}
                onRetry={fetchTaxonomyTree}
              />
            ) : filteredTree.length === 0 ? (
              <EmptyState
                title={searchQuery ? 'No matching tags found' : 'No taxonomy tags registered'}
                description={
                  searchQuery
                    ? `No topic tags match "${searchQuery}". Clear your search query or create a new tag.`
                    : 'Start building your scientific topic hierarchy by creating the first root domain category.'
                }
                icon={FolderTree}
                actionLabel={canEdit ? 'Create Root Domain' : undefined}
                onAction={canEdit ? handleOpenCreateRoot : undefined}
              />
            ) : (
              <div className="space-y-1">
                {filteredTree.map((rootNode) => (
                  <TagTreeItem
                    key={rootNode.id}
                    node={rootNode}
                    selectedTagId={selectedTag?.id}
                    onSelectTag={(node) => setSelectedTag(node)}
                    onAddChild={handleOpenAddChild}
                    onEditTag={handleOpenEdit}
                    onDeleteTag={(node) => setTagToDelete(node)}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    searchQuery={searchQuery}
                    expandedMap={expandedMap}
                    onToggleExpand={handleToggleExpand}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Tag Inspector */}
        <div className="space-y-4">
          {selectedTag ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 p-5 shadow-xs space-y-4 sticky top-6">
              <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Tag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Topic Inspector
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                    {selectedTag.name}
                  </h3>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleOpenEdit(selectedTag)}
                      iconLeft={Edit2}
                    >
                      Edit
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setTagToDelete(selectedTag)}
                      className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                      iconLeft={Trash2}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>

              {/* Tag Details */}
              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-bold text-slate-700 dark:text-slate-300 block mb-0.5">
                    Hierarchical Path
                  </span>
                  <div className="font-mono text-indigo-700 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/60 p-2 rounded-lg border border-indigo-200 dark:border-indigo-800/60 break-all">
                    {selectedTag.canonicalPath || selectedTag.slug}
                  </div>
                </div>

                <div>
                  <span className="font-bold text-slate-700 dark:text-slate-300 block mb-0.5">
                    Identifier Slug
                  </span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    {selectedTag.slug}
                  </span>
                </div>

                <div>
                  <span className="font-bold text-slate-700 dark:text-slate-300 block mb-0.5">
                    Domain Hierarchy Tier
                  </span>
                  <span className="text-slate-800 dark:text-slate-200">
                    Level {(selectedTag.depth || 0) + 1}{' '}
                    {selectedTag.depth === 0 ? '(Root Domain)' : '(Nested Subtopic)'}
                  </span>
                </div>

                <div>
                  <span className="font-bold text-slate-700 dark:text-slate-300 block mb-0.5">
                    Description & Scope
                  </span>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    {selectedTag.description || 'No scientific scope description provided for this topic.'}
                  </p>
                </div>

                <div>
                  <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Child Subtopics ({selectedTag.children?.length || 0})
                  </span>
                  {selectedTag.children && selectedTag.children.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTag.children.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => setSelectedTag(child)}
                          className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:border-indigo-400 transition cursor-pointer"
                        >
                          ↳ {child.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic">Leaf topic node (no sub-categories)</p>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2">
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenAddChild(selectedTag)}
                    iconLeft={Plus}
                    className="w-full justify-center"
                  >
                    Add Subtopic beneath this Tag
                  </Button>
                )}

                <Link to={`/tagging?tagId=${selectedTag.id}`} className="w-full">
                  <Button variant="primary" size="sm" iconLeft={FileText} className="w-full justify-center">
                    Assign to Papers in Workspace
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
              <FolderTree className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="font-bold text-slate-800 dark:text-slate-200">No Topic Selected</p>
              <p>Click on any topic tag in the taxonomy tree to inspect its canonical path, child subtopics, and metadata.</p>
            </div>
          )}
        </div>
      </div>

      {/* Tag Form Modal (Create Root, Create Child, Edit) */}
      <TagFormModal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSaved={handleSavedTag}
        mode={formModalMode}
        parentTag={modalParentTag}
        tagToEdit={modalTagToEdit}
        allTags={tagTree}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={Boolean(tagToDelete)}
        onClose={() => setTagToDelete(null)}
        onConfirm={handleConfirmDelete}
        loading={deleting}
        title="Delete Topic Tag"
        message={
          tagToDelete?.children && tagToDelete.children.length > 0
            ? `Cannot delete "${tagToDelete?.name}" because it contains ${tagToDelete.children.length} child tag(s). The backend taxonomy requires all children to be removed or reparented first.`
            : `Are you sure you want to delete the topic tag "${tagToDelete?.name}"? This action cannot be undone.`
        }
        confirmText={tagToDelete?.children && tagToDelete.children.length > 0 ? undefined : 'Delete Tag'}
        danger
      />
    </div>
  );
}
