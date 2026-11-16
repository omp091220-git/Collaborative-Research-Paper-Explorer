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
  if (!node) return null;

  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isExpanded = expandedMap[node.id] ?? true;
  const isSelected = selectedTagId === node.id;

  // Highlight search text if query provided
  const renderHighlightedName = (text, query) => {
    const safeText = String(text || '');
    if (!query || !query.trim()) return safeText;
    const parts = safeText.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-amber-400/30 text-amber-200 rounded px-1 font-bold">
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
        className={`group flex items-center justify-between py-2.5 px-3.5 rounded-2xl transition-all cursor-pointer border ${
          isSelected
            ? 'bg-violet-600/15 border-violet-500/50 shadow-sm shadow-violet-950/20 text-[#F8FAFC]'
            : 'border-transparent hover:bg-white/[0.05] text-[#F8FAFC]'
        }`}
        style={{ paddingLeft: `${Math.max(0.75, (node.depth || 0) * 1.5 + 0.75)}rem` }}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Expand/Collapse or Leaf bullet */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand && onToggleExpand(node.id);
              }}
              className="p-1 rounded-lg text-[#71758B] hover:text-[#F8FAFC] hover:bg-white/10 transition cursor-pointer"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-violet-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[#A1A1B5]" />
              )}
            </button>
          ) : (
            <span className="w-6 h-6 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-[#71758B]" />
            </span>
          )}

          {/* Tag Icon */}
          <div
            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border ${
              hasChildren
                ? 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
            }`}
          >
            {hasChildren ? <FolderTree className="w-3.5 h-3.5" /> : <Tag className="w-3.5 h-3.5" />}
          </div>

          {/* Tag Label and Slug */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-[#F8FAFC] truncate">
                {renderHighlightedName(node.name, searchQuery)}
              </span>
              <span className="text-[11px] font-mono text-[#71758B]">
                ({node.slug})
              </span>
              {node.canonicalPath && (
                <span
                  className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#23263A] text-[#A1A1B5] border border-white/10 max-w-[200px] truncate"
                  title={node.canonicalPath}
                >
                  {node.canonicalPath}
                </span>
              )}
            </div>
            {node.description && (
              <p className="text-xs text-[#A1A1B5] truncate mt-0.5 font-normal">
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
                className="p-1.5 rounded-lg text-[#A1A1B5] hover:text-[#F8FAFC] hover:bg-violet-500/20 transition cursor-pointer"
                title={`Add child tag beneath "${node.name}"`}
                aria-label="Add child tag"
              >
                <Plus className="w-3.5 h-3.5 text-violet-400" />
              </button>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditTag && onEditTag(node);
                }}
                className="p-1.5 rounded-lg text-[#A1A1B5] hover:text-[#F8FAFC] hover:bg-white/10 transition cursor-pointer"
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
                className="p-1.5 rounded-lg text-[#71758B] hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
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
        <div className="space-y-1 mt-1 border-l border-white/[0.08] ml-4 pl-1">
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
