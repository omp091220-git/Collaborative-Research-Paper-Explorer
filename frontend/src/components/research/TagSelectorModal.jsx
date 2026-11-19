import { useState, useMemo } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { Search, Tag, Check, X, CheckSquare, Square } from 'lucide-react';
import Badge from '../common/Badge';

export default function TagSelectorModal({
  isOpen,
  onClose,
  tagTree = [],
  allTags = [],
  assignedTagIds = [],
  onSelectTag, // Can be called with single tag or array of tags
  title = 'Assign Topic Tags',
  description = 'Select hierarchical taxonomy topic tags to assign to this research target.',
  loading = false,
  multiSelect = true,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);

  // Flatten the tree into an indexed list with canonical paths and depth if allTags is not supplied
  const flatTags = useMemo(() => {
    if (allTags && allTags.length > 0) return allTags;
    const list = [];
    const walk = (nodes, currentPath = '', depth = 0) => {
      for (const node of nodes) {
        const fullPath =
          node.canonicalPath ||
          node.canonical_path ||
          (currentPath ? `${currentPath}::${node.slug}` : node.slug);
        list.push({
          ...node,
          computedCanonicalPath: fullPath,
          depth,
        });
        if (node.children && node.children.length > 0) {
          walk(node.children, fullPath, depth + 1);
        }
      }
    };
    walk(tagTree);
    return list;
  }, [tagTree, allTags]);

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return flatTags;
    const q = searchQuery.toLowerCase().trim();
    return flatTags.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.slug?.toLowerCase().includes(q) ||
        (t.canonicalPath && t.canonicalPath.toLowerCase().includes(q)) ||
        (t.computedCanonicalPath && t.computedCanonicalPath.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }, [flatTags, searchQuery]);

  const handleToggleTag = (tag) => {
    if (assignedTagIds.includes(tag.id)) return; // Prevent duplicate assignments
    if (!multiSelect) {
      onSelectTag(tag);
      return;
    }

    setSelectedTags((prev) => {
      const exists = prev.some((t) => t.id === tag.id);
      if (exists) {
        return prev.filter((t) => t.id !== tag.id);
      }
      return [...prev, tag];
    });
  };

  const handleRemoveSelectedChip = (tagId) => {
    setSelectedTags((prev) => prev.filter((t) => t.id !== tagId));
  };

  const handleConfirmMultiSelect = () => {
    if (selectedTags.length === 0) return;
    onSelectTag(selectedTags);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div className="space-y-3">
        <p className="text-xs text-theme-secondary">{description}</p>

        {/* Selected Tags Chips Bar */}
        {multiSelect && selectedTags.length > 0 && (
          <div className="p-2.5 bg-violet-500/10 rounded-xl border border-violet-500/25 space-y-1.5">
            <div className="text-[11px] font-bold text-violet-300 flex items-center justify-between">
              <span>Selected for Assignment ({selectedTags.length})</span>
              <button
                type="button"
                onClick={() => setSelectedTags([])}
                className="text-[10px] text-violet-400 hover:underline cursor-pointer"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedTags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-violet-600 text-white text-[11px] font-semibold shadow-xs"
                >
                  <span>{tag.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSelectedChip(tag.id)}
                    className="hover:text-violet-200 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 text-theme-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search topic tags by name, slug, or hierarchy..."
            className="w-full pl-9 pr-8 py-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl text-theme-main placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-main"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Tags List */}
        <div className="max-h-72 overflow-y-auto space-y-1.5 divide-y divide-[var(--border-subtle)] pr-1">
          {filteredTags.length === 0 ? (
            <div className="text-center py-8 text-xs text-theme-muted">
              No matching topic tags found in the taxonomy.
            </div>
          ) : (
            filteredTags.map((tag) => {
              const isAssigned = assignedTagIds.includes(tag.id);
              const isSelected = selectedTags.some((t) => t.id === tag.id);
              const pathDisplay =
                tag.canonicalPath ||
                tag.canonical_path ||
                tag.computedCanonicalPath ||
                tag.slug;

              return (
                <div
                  key={tag.id}
                  onClick={() => !isAssigned && !loading && handleToggleTag(tag)}
                  className={`pt-1.5 first:pt-0 flex items-center justify-between p-2.5 rounded-xl transition ${
                    isAssigned
                      ? 'bg-theme-elevated/40 opacity-60 cursor-not-allowed'
                      : isSelected
                      ? 'bg-violet-500/15 border border-violet-500/40 shadow-2xs cursor-pointer'
                      : 'hover:bg-theme-elevated border border-transparent cursor-pointer'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {multiSelect && !isAssigned ? (
                      <div className="mt-0.5 text-violet-400 shrink-0">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-violet-400" />
                        ) : (
                          <Square className="w-4 h-4 text-theme-muted" />
                        )}
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-violet-500/15 text-violet-300 flex items-center justify-center shrink-0 mt-0.5">
                        <Tag className="w-3.5 h-3.5" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-theme-main truncate">
                          {tag.name}
                        </span>
                        <span className="text-[10px] font-mono text-theme-muted">
                          ({tag.slug})
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-violet-400 truncate mt-0.5">
                        {pathDisplay}
                      </p>
                      {tag.description && (
                        <p className="text-[11px] text-theme-secondary line-clamp-1 mt-0.5 font-sans">
                          {tag.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="ml-2 shrink-0">
                    {isAssigned ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-theme-muted">
                        <Check className="w-3.5 h-3.5" /> Already Assigned
                      </span>
                    ) : multiSelect ? (
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                          isSelected
                            ? 'bg-violet-600 text-white'
                            : 'bg-theme-elevated text-theme-secondary'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        disabled={loading}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTag(tag);
                        }}
                      >
                        Assign
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-theme-subtle">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>

          {multiSelect && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={loading || selectedTags.length === 0}
              onClick={handleConfirmMultiSelect}
              className="gap-1.5"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>
                {selectedTags.length > 0
                  ? `Assign ${selectedTags.length} Topic Tag${selectedTags.length > 1 ? 's' : ''}`
                  : 'Select Tags to Assign'}
              </span>
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
