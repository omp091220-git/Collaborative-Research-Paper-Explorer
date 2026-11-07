import { useState } from 'react';
import { FolderKanban, FileText, Globe, Lock, Trash2, ArrowUpRight } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import ConfirmationDialog from '../common/ConfirmationDialog';

export default function CollectionCard({ collection, onDelete, onSelect }) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <Card hoverable className="p-5 flex flex-col justify-between h-full bg-white border-slate-200/90 group">
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <FolderKanban className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={collection.isPublic ? 'blue' : 'default'} size="xs">
              {collection.isPublic ? (
                <>
                  <Globe className="w-2.5 h-2.5" /> Public
                </>
              ) : (
                <>
                  <Lock className="w-2.5 h-2.5" /> Private
                </>
              )}
            </Badge>

            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmOpen(true);
                }}
                className="text-slate-300 hover:text-rose-600 p-1 rounded transition opacity-0 group-hover:opacity-100 cursor-pointer"
                title="Delete Collection"
                aria-label="Delete Collection"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div onClick={() => onSelect && onSelect(collection)} className="cursor-pointer">
          <h3 className="text-sm font-semibold text-slate-900 leading-snug group-hover:text-indigo-600 transition">
            {collection.name}
          </h3>
          {collection.description && (
            <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
              {collection.description}
            </p>
          )}
        </div>
      </div>

      <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1 font-medium text-slate-600">
          <FileText className="w-3 h-3 text-slate-400" />
          <span>{collection.paperIds?.length || 0} papers</span>
        </span>

        <button
          type="button"
          onClick={() => onSelect && onSelect(collection)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
        >
          <span>Open</span>
          <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>

      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          onDelete(collection.id);
          setDeleteConfirmOpen(false);
        }}
        title="Delete Collection"
        message={`Are you sure you want to remove the collection "${collection.name}"? Papers in your library will not be deleted.`}
        confirmText="Delete Collection"
        danger
      />
    </Card>
  );
}
