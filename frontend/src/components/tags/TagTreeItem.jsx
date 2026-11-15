import {
  ChevronRight,
  ChevronDown,
  Tag,
  Plus,
  Edit2,
  Trash2,
  FolderTree,
} from 'lucide-react';
import Badge from '../common/Badge';

export default function TagTreeItem({
  node,
  selectedTagId,
  onSelectTag,
  onAddChild,
  onEditTag,
  onDeleteTag,
  canEdit = false,
  canDelete = false,
  searchQuery = '',
  expandedMap = {},
  onToggleExpand,
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedMap[node.id] ?? true;
  const isSelected = selectedTagId === node.id;

  // Highlight search text if query provided
  const renderHighlightedName = (text, query) => {
    if (!query || !query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-amber-200 dark:bg-amber-900/60 text-slate-900 dark:text-amber-100 rounded px-0.5 font-bold">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="select-none">
      {/* Node Row */}
      <div
        onClick={() => onSelectTag && onSelectTag(node)}
        className={`group flex items-center justify-between py-2 px-3 rounded-xl transition-all cursor-pointer border ${
          isSelected
            ? 'bg-indigo-50/90 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-600 shadow-xs'
            : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60'
        }`}
        style={{ paddingLeft: `${Math.max(0.75, (node.depth || 0) * 1.5 + 0.75)}rem` }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Expand/Collapse or Leaf bullet */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand && onToggleExpand(node.id);
              }}
              className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition cursor-pointer"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              )}
            </button>
          ) : (
            <span className="w-6 h-6 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
            </span>
          )}

          {/* Tag Icon */}
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              hasChildren
                ? 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300'
                : 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300'
            }`}
          >
            {hasChildren ? <FolderTree className="w-3.5 h-3.5" /> : <Tag className="w-3.5 h-3.5" />}
          </div>

          {/* Tag Label and Slug */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {renderHighlightedName(node.name, searchQuery)}
              </span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                ({node.slug})
              </span>
              {node.canonicalPath && (
                <span
                  className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 max-w-[200px] truncate"
                  title={node.canonicalPath}
                >
                  {node.canonicalPath}
                </span>
              )}
            </div>
            {node.description && (
              <p className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5">
                {node.description}
              </p>
            )}
          </div>
        </div>

        {/* Right Info & Actions */}
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {hasChildren && (
            <Badge variant="default" size="xs">
              {node.children.length} {node.children.length === 1 ? 'child' : 'children'}
            </Badge>
          )}

          {/* Action buttons on hover/selection */}
          <div className="flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
            {canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddChild && onAddChild(node);
                }}
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition cursor-pointer"
                title={`Add child tag beneath "${node.name}"`}
                aria-label="Add child tag"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditTag && onEditTag(node);
                }}
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition cursor-pointer"
                title={`Edit tag "${node.name}"`}
                aria-label="Edit tag"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTag && onDeleteTag(node);
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                title={`Delete tag "${node.name}" (Admin only)`}
                aria-label="Delete tag"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Render Children Recursively */}
      {hasChildren && isExpanded && (
        <div className="space-y-1 mt-1 border-l-2 border-slate-200 dark:border-slate-800 ml-4 pl-1">
          {node.children.map((child) => (
            <TagTreeItem
              key={child.id}
              node={child}
              selectedTagId={selectedTagId}
              onSelectTag={onSelectTag}
              onAddChild={onAddChild}
              onEditTag={onEditTag}
              onDeleteTag={onDeleteTag}
              canEdit={canEdit}
              canDelete={canDelete}
              searchQuery={searchQuery}
              expandedMap={expandedMap}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}
