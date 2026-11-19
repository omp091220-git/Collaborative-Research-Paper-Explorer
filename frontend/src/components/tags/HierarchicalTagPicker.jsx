import { useState, useMemo } from 'react';
import { Search, Tag, Check, X, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import Badge from '../common/Badge';

export default function HierarchicalTagPicker({
  tagTree = [],
  assignedTagIds = [],
  onSelectTag,
  onClose,
  isOpen = true,
  title = 'Assign Topic Tag',
  description = 'Select an existing hierarchical taxonomy tag to assign.',
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // Flatten the tree into an indexed list with canonical paths and depth
  const flatTags = useMemo(() => {
    const list = [];
    const walk = (nodes, currentPath = '') => {
      for (const node of nodes) {
        const fullPath = node.canonicalPath || (currentPath ? `${currentPath}::${node.slug}` : node.slug);
        list.push({
          ...node,
          computedCanonicalPath: fullPath,
        });
        if (node.children && node.children.length > 0) {
          walk(node.children, fullPath);
        }
      }
    };
    walk(tagTree);
    return list;
  }, [tagTree]);

  // Filter tags based on search query
  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return flatTags;
    const q = searchQuery.toLowerCase().trim();
    return flatTags.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        (t.computedCanonicalPath && t.computedCanonicalPath.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }, [flatTags, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="bg-theme-card rounded-2xl border border-theme-subtle shadow-2xl p-4 w-full max-w-lg space-y-3 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-theme-subtle">
        <div>
          <h4 className="text-sm font-bold text-theme-main flex items-center gap-2">
            <Tag className="w-4 h-4 text-violet-400" />
            <span>{title}</span>
          </h4>
          <p className="text-xs text-theme-secondary mt-0.5">{description}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-theme-muted hover:text-theme-main hover:bg-theme-elevated transition cursor-pointer"
            aria-label="Close picker"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-theme-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search topic tags by name or path..."
          className="w-full pl-9 pr-3 py-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl text-theme-main placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
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
      <div className="max-h-64 overflow-y-auto space-y-1 divide-y divide-[var(--border-subtle)] pr-1">
        {filteredTags.length === 0 ? (
          <div className="text-center py-6 text-xs text-theme-muted">
            <p>No matching taxonomy tags found.</p>
            <Link
              to="/taxonomy"
              className="mt-2 inline-flex items-center gap-1 text-violet-400 font-semibold hover:underline"
            >
              <span>Manage Topic Taxonomy</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        ) : (
          filteredTags.map((tag) => {
            const isAssigned = assignedTagIds.includes(tag.id);
            return (
              <div
                key={tag.id}
                onClick={() => !isAssigned && onSelectTag && onSelectTag(tag)}
                className={`pt-1.5 first:pt-0 pb-1.5 px-2 rounded-xl flex items-center justify-between gap-3 transition ${
                  isAssigned
                    ? 'opacity-60 bg-theme-elevated/40 cursor-not-allowed'
                    : 'hover:bg-violet-500/10 cursor-pointer'
                }`}
                style={{ paddingLeft: `${Math.max(0.5, (tag.depth || 0) * 0.8 + 0.5)}rem` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-theme-main">
                      {tag.name}
                    </span>
                    <span className="text-[10px] font-mono text-theme-muted">
                      ({tag.slug})
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-violet-400 truncate mt-0.5">
                    {tag.computedCanonicalPath || tag.canonicalPath || tag.slug}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {isAssigned ? (
                    <Badge variant="emerald" size="xs">
                      <Check className="w-3 h-3 mr-1" />
                      Assigned
                    </Badge>
                  ) : (
                    <span className="text-[11px] font-semibold text-violet-400">
                      Select
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer info */}
      <div className="pt-2 border-t border-theme-subtle flex items-center justify-between text-[11px] text-theme-secondary">
        <span>{filteredTags.length} tags available</span>
        <Link
          to="/taxonomy"
          className="inline-flex items-center gap-1 text-violet-400 font-semibold hover:underline"
        >
          <span>Need a new tag? Open Taxonomy</span>
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
