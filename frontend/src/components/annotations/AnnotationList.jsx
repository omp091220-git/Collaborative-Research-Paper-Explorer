import { useState } from 'react';
import AnnotationCard from './AnnotationCard';
import Button from '../common/Button';
import EmptyState from '../common/EmptyState';
import { MessageSquarePlus, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function AnnotationList({
  annotations = [],
  loading = false,
  onAddAnnotation,
  onEditAnnotation,
  onDeleteAnnotation,
}) {
  const { hasPermission } = useAuth();
  const [selectedPage, setSelectedPage] = useState('all');

  const pages = Array.from(
    new Set(annotations.map((a) => a.page_number).filter(Boolean))
  ).sort((a, b) => a - b);

  const filtered =
    selectedPage === 'all'
      ? annotations
      : annotations.filter((a) => a.page_number === Number(selectedPage));

  return (
    <div className="space-y-4">
      {/* Header with Page Filter & Add CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-800">
            Paper Annotations ({annotations.length})
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {pages.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Filter Page:</span>
              <select
                value={selectedPage}
                onChange={(e) => setSelectedPage(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700 cursor-pointer"
              >
                <option value="all">All Pages</option>
                {pages.map((p) => (
                  <option key={p} value={p}>
                    Page {p}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasPermission('papers:upload') && (
            <Button
              variant="outline"
              size="xs"
              onClick={onAddAnnotation}
              iconLeft={MessageSquarePlus}
            >
              Add Annotation
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          Loading annotations...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={selectedPage === 'all' ? 'No annotations yet' : `No annotations on Page ${selectedPage}`}
          description="Be the first to add a comment, highlight a finding, or ask a question regarding this research paper."
          actionLabel={hasPermission('papers:upload') ? 'Add Annotation' : undefined}
          onAction={hasPermission('papers:upload') ? onAddAnnotation : undefined}
          actionIcon={MessageSquarePlus}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <AnnotationCard
              key={item.id}
              annotation={item}
              onEdit={onEditAnnotation}
              onDelete={onDeleteAnnotation}
            />
          ))}
        </div>
      )}
    </div>
  );
}
