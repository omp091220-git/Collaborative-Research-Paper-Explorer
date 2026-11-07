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
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-xl p-4 w-full max-w-lg space-y-3 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Tag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>{title}</span>
          </h4>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{description}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            aria-label="Close picker"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search topic tags by name or path..."
          className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
          autoFocus
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tags List */}
      <div className="max-h-64 overflow-y-auto space-y-1 divide-y divide-slate-100 dark:divide-slate-800/60 pr-1">
        {filteredTags.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500 dark:text-slate-400">
            <p>No matching taxonomy tags found.</p>
            <Link
              to="/taxonomy"
              className="mt-2 inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
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
                className={`pt-1.5 first:pt-0 pb-1.5 px-2 rounded-lg flex items-center justify-between gap-3 transition ${
                  isAssigned
                    ? 'opacity-60 bg-slate-50 dark:bg-slate-800/40 cursor-not-allowed'
                    : 'hover:bg-indigo-50/70 dark:hover:bg-indigo-950/50 cursor-pointer'
                }`}
                style={{ paddingLeft: `${Math.max(0.5, (tag.depth || 0) * 0.8 + 0.5)}rem` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {tag.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                      ({tag.slug})
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-indigo-700 dark:text-indigo-400 truncate mt-0.5">
                    {tag.computedCanonicalPath || tag.canonicalPath || tag.slug}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {isAssigned ? (
                    <Badge variant="success" size="xs">
                      <Check className="w-3 h-3 mr-1" />
                      Assigned
                    </Badge>
                  ) : (
                    <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
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
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
        <span>{filteredTags.length} tags available</span>
        <Link
          to="/taxonomy"
          className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
        >
          <span>Need a new tag? Open Taxonomy</span>
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
