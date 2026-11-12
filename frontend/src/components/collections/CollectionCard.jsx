import { FolderKanban, FileText, Globe, Lock, Trash2, ArrowUpRight } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';

export default function CollectionCard({ collection, onDelete, onSelect }) {
  return (
    <Card hoverable className="p-5 flex flex-col justify-between h-full bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 group">
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 flex items-center justify-center font-bold">
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
                  onDelete(collection);
                }}
                className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition opacity-0 group-hover:opacity-100 cursor-pointer"
                title="Delete Collection"
                aria-label="Delete Collection"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div onClick={() => onSelect && onSelect(collection)} className="cursor-pointer">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
            {collection.name}
          </h3>
          {collection.description && (
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-1.5 line-clamp-2 leading-relaxed">
              {collection.description}
            </p>
          )}
        </div>
      </div>

      <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
        <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
          <FileText className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span>{collection.paperIds?.length || 0} papers</span>
        </span>

        <button
          type="button"
          onClick={() => onSelect && onSelect(collection)}
          className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer"
        >
          <span>Open</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </Card>
  );
}
