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
    <div className="space-y-7 animate-fadeIn text-theme-main">
      {/* Page Header */}
      <PageHeader
        title="Hierarchical Topic Taxonomy (FR-10)"
        description="Organize, curate, and explore the research classification taxonomy. Tags form a strict tree of subdomains for multi-level categorization."
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="p-5 bg-theme-card rounded-2xl border border-theme-subtle shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-theme-secondary">Total Classified Topics</p>
            <p className="text-2xl font-extrabold text-theme-main mt-1">{stats.total}</p>
          </div>
          <div className="p-3 rounded-2xl bg-violet-500/15 border border-violet-500/25 text-violet-400 font-bold">
            <Tag className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 bg-theme-card rounded-2xl border border-theme-subtle shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-theme-secondary">Root Domains</p>
            <p className="text-2xl font-extrabold text-theme-main mt-1">{stats.roots}</p>
          </div>
          <div className="p-3 rounded-2xl bg-purple-500/15 border border-purple-500/25 text-purple-400 font-bold">
            <FolderTree className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 bg-theme-card rounded-2xl border border-theme-subtle shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-theme-secondary">Maximum Subtree Depth</p>
            <p className="text-2xl font-extrabold text-theme-main mt-1">
              {stats.maxDepth > 0 ? `${stats.maxDepth + 1} Tiers` : '1 Tier'}
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 font-bold">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Interactive Taxonomy Tree */}
        <div className="lg:col-span-2 bg-theme-card rounded-2xl border border-theme-subtle p-5 sm:p-6 shadow-sm space-y-5 flex flex-col">
          {/* Search & Tree Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-theme-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search taxonomy by topic name, slug, or path..."
                className="w-full pl-10 pr-3 py-2 text-xs bg-theme-secondary border border-white/10 rounded-xl text-theme-main placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition"
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
              <div className="flex flex-col items-center justify-center py-16 text-xs text-theme-muted space-y-3">
                <RefreshCw className="w-5 h-5 animate-spin text-violet-400" />
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
            <div className="bg-theme-card rounded-2xl border border-theme-subtle p-5 sm:p-6 shadow-sm space-y-4 sticky top-20">
              <div className="flex items-start justify-between gap-2 pb-3.5 border-b border-theme-subtle">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Tag className="w-4 h-4 text-violet-400" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-theme-secondary">
                      Topic Inspector
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-theme-main truncate">
                    {selectedTag.name}
                  </h3>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
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
                      variant="dangerOutline"
                      size="xs"
                      onClick={() => setTagToDelete(selectedTag)}
                      iconLeft={Trash2}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>

              {/* Tag Details */}
              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="font-semibold text-theme-secondary block mb-1">
                    Hierarchical Path
                  </span>
                  <div className="font-mono text-violet-300 bg-theme-elevated p-2.5 rounded-xl border border-white/10 break-all">
                    {selectedTag.canonicalPath || selectedTag.slug}
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-theme-secondary block mb-1">
                    Identifier Slug
                  </span>
                  <span className="font-mono text-theme-main bg-theme-elevated px-2.5 py-1 rounded-lg border border-white/10">
                    {selectedTag.slug}
                  </span>
                </div>

                <div>
                  <span className="font-semibold text-theme-secondary block mb-0.5">
                    Domain Hierarchy Tier
                  </span>
                  <span className="text-theme-main font-medium">
                    Level {(selectedTag.depth || 0) + 1}{' '}
                    {selectedTag.depth === 0 ? '(Root Domain)' : '(Nested Subtopic)'}
                  </span>
                </div>

                <div>
                  <span className="font-semibold text-theme-secondary block mb-1">
                    Description & Scope
                  </span>
                  <p className="text-theme-secondary leading-relaxed bg-theme-secondary p-3 rounded-xl border border-theme-subtle">
                    {selectedTag.description || 'No scientific scope description provided for this topic.'}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-theme-secondary block mb-1.5">
                    Child Subtopics ({selectedTag.children?.length || 0})
                  </span>
                  {selectedTag.children && selectedTag.children.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTag.children.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => setSelectedTag(child)}
                          className="px-2.5 py-1 rounded-lg bg-theme-elevated hover:bg-violet-600/20 text-theme-main text-xs font-medium border border-white/10 hover:border-violet-500/40 transition cursor-pointer"
                        >
                          ↳ {child.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-theme-muted italic">Leaf topic node (no sub-categories)</p>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="pt-4 border-t border-theme-subtle flex flex-col gap-2.5">
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
            <div className="p-8 rounded-2xl border border-dashed border-white/10 bg-theme-card text-center text-xs text-theme-muted space-y-2.5">
              <FolderTree className="w-8 h-8 text-theme-muted mx-auto" />
              <p className="font-bold text-theme-main">No Topic Selected</p>
              <p className="leading-relaxed">Click on any topic tag in the taxonomy tree to inspect its canonical path, child subtopics, and metadata.</p>
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
