import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bookmark, Clock, BookOpen, Trash2 } from 'lucide-react';
import { useLibrary } from '../../context/LibraryContext';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/layout/PageHeader';
import PaperCard from '../../components/papers/PaperCard';
import PaperSummaryModal from '../../components/papers/PaperSummaryModal';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import Badge from '../../components/common/Badge';

export default function LibraryPage() {
  const {
    bookmarks,
    readingList,
    removeBookmark,
    setReadingStatus,
    clearAllBookmarks,
  } = useLibrary();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('bookmarks'); // 'bookmarks' | 'queue'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [summaryPaper, setSummaryPaper] = useState(null);

  const safeBookmarks = Array.isArray(bookmarks) ? bookmarks : [];
  const queue = readingList && typeof readingList === 'object' && !Array.isArray(readingList)
    ? readingList
    : {};

  const handleRemove = (paperId, title) => {
    if (removeBookmark) {
      removeBookmark(paperId);
    }
    addToast({
      type: 'info',
      title: 'Bookmark Removed',
      message: `"${title || 'Paper'}" was removed from your library.`,
    });
  };

  const filteredQueue = Object.entries(queue).filter(([, rawItem]) => {
    if (!rawItem) return false;
    const itemStatus = typeof rawItem === 'string' ? rawItem : rawItem.status;
    if (statusFilter === 'ALL') return true;
    return itemStatus === statusFilter;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <PageHeader
        title="My Research Library"
        description="Organize your reading list, track research papers in progress, and review saved bookmarks."
        actions={
          safeBookmarks.length > 0 && activeTab === 'bookmarks' && clearAllBookmarks ? (
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllBookmarks}
              className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              <span>Clear Bookmarks</span>
            </Button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex space-x-8" aria-label="Library Tabs">
          <button
            type="button"
            onClick={() => setActiveTab('bookmarks')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'bookmarks'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>Saved Bookmarks</span>
            <Badge variant="indigo" size="sm">
              {safeBookmarks.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'queue'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Reading Queue</span>
            <Badge variant="default" size="sm">
              {Object.keys(queue).length}
            </Badge>
          </button>
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'bookmarks' && (
        <div>
          {safeBookmarks.length === 0 ? (
            <EmptyState
              title="No bookmarks yet"
              description="Save research papers as you explore to easily find them later in your personal library."
              icon={Bookmark}
              actionLabel="Explore Papers"
              onAction={() => navigate('/explore')}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {safeBookmarks.map((paper) => (
                <div key={paper.id} className="relative group">
                  <PaperCard
                    paper={paper}
                    onOpenSummary={(p) => setSummaryPaper(p)}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(paper.id, paper.title);
                    }}
                    className="absolute top-4 right-14 p-1.5 rounded-lg bg-white/90 dark:bg-slate-800/90 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 shadow-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Remove from library"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'queue' && (
        <div className="space-y-4">
          {/* Status Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {['ALL', 'WANT_TO_READ', 'READING', 'COMPLETED'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  statusFilter === status
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                {status.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          {filteredQueue.length === 0 ? (
            <EmptyState
              title="No papers in reading queue"
              description="Track your reading status for individual papers to maintain a structured literature review."
              icon={BookOpen}
              actionLabel="Explore Papers"
              onAction={() => navigate('/explore')}
            />
          ) : (
            <div className="space-y-3">
              {filteredQueue.map(([paperId, rawItem]) => {
                const item = typeof rawItem === 'object' && rawItem !== null ? rawItem : { status: rawItem };
                const currentStatus = item.status || 'WANT_TO_READ';
                const formattedDate = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : 'Recently';

                return (
                  <div
                    key={paperId}
                    className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <Link
                        to={`/papers/${paperId}`}
                        className="font-bold text-sm text-slate-900 dark:text-white hover:text-indigo-600 hover:underline"
                      >
                        {item.title || `Paper #${paperId}`}
                      </Link>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        <span>Updated {formattedDate}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={currentStatus}
                        onChange={(e) =>
                          setReadingStatus && setReadingStatus(paperId, e.target.value, item.title)
                        }
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <option value="WANT_TO_READ">Want to read</option>
                        <option value="READING">Reading</option>
                        <option value="COMPLETED">Completed</option>
                      </select>

                      <Link to={`/papers/${paperId}`}>
                        <Button variant="outline" size="sm">
                          View Paper
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Summary Modal */}
      <PaperSummaryModal
        paper={summaryPaper}
        isOpen={Boolean(summaryPaper)}
        onClose={() => setSummaryPaper(null)}
      />
    </div>
  );
}
