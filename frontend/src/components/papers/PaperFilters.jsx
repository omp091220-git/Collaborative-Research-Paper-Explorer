import { LayoutGrid, List, RotateCcw, Tag, Calendar } from 'lucide-react';
import SearchInput from '../common/SearchInput';
import Button from '../common/Button';

export default function PaperFilters({
  searchQuery,
  onSearchChange,
  filterType,
  selectedSource,
  onFilterTypeChange,
  onSourceChange,
  selectedTopic = '',
  onTopicChange,
  topics = [],
  selectedYear = '',
  onYearChange,
  sortBy,
  onSortByChange,
  onSortChange,
  viewMode,
  onViewModeChange,
  onReset,
}) {
  const currentSource = selectedSource || filterType || 'all';
  const handleSourceChange = onSourceChange || onFilterTypeChange;
  const currentSort = sortBy || 'newest';
  const handleSortChange = onSortChange || onSortByChange;

  const hasActiveFilters = Boolean(
    searchQuery ||
    selectedTopic ||
    selectedYear ||
    currentSource !== 'all' ||
    (currentSort !== 'newest' && currentSort !== 'created_at')
  );

  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-6 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-800 shadow-xs">
      {/* Search Input */}
      <div className="flex-1 min-w-[240px]">
        <SearchInput
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search by title, authors, abstract, arXiv ID, or year..."
          shortcutKey="/"
        />
      </div>

      {/* Filter and Sort controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Topic Tag Filter */}
        {topics.length > 0 && (
          <select
            value={selectedTopic}
            onChange={(e) => onTopicChange && onTopicChange(e.target.value)}
            className="text-xs bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-2xs cursor-pointer max-w-[170px] truncate"
            title="Filter by topic tag"
          >
            <option value="">All Topics</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.canonicalPath || t.name}
              </option>
            ))}
          </select>
        )}

        {/* Source Filter */}
        <select
          value={currentSource}
          onChange={(e) => handleSourceChange && handleSourceChange(e.target.value)}
          className="text-xs bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-2xs cursor-pointer"
        >
          <option value="all">All Sources</option>
          <option value="arxiv">arXiv Only</option>
          <option value="upload">Direct Uploads</option>
        </select>

        {/* Sort dropdown */}
        <select
          value={currentSort}
          onChange={(e) => handleSortChange && handleSortChange(e.target.value)}
          className="text-xs bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-2xs cursor-pointer"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="year_desc">Year (Newest)</option>
          <option value="title_asc">Title (A-Z)</option>
          <option value="title_desc">Title (Z-A)</option>
          <option value="size_desc">File Size (Largest)</option>
        </select>

        {/* Reset Filters button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onReset}
            iconLeft={RotateCcw}
            title="Reset Filters"
          >
            Reset
          </Button>
        )}

        {/* View Mode Toggle */}
        <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg p-0.5 bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            className={`p-1.5 rounded-md transition cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Grid View"
            aria-label="Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            className={`p-1.5 rounded-md transition cursor-pointer ${
              viewMode === 'list'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="List View"
            aria-label="List View"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
