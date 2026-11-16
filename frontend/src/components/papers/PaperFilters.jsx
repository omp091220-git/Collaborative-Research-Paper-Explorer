import { LayoutGrid, List, RotateCcw } from 'lucide-react';
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
    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5 mb-7 p-3.5 bg-[#1B1D2B] rounded-2xl border border-white/[0.08] shadow-sm">
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
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Topic Tag Filter */}
        {topics.length > 0 && (
          <select
            value={selectedTopic}
            onChange={(e) => onTopicChange && onTopicChange(e.target.value)}
            className="text-xs bg-[#23263A] hover:bg-[#2B2F46] border border-white/10 rounded-xl px-3 py-2 text-[#F8FAFC] font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500/30 shadow-xs cursor-pointer max-w-[170px] truncate transition"
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
          className="text-xs bg-[#23263A] hover:bg-[#2B2F46] border border-white/10 rounded-xl px-3 py-2 text-[#F8FAFC] font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500/30 shadow-xs cursor-pointer transition"
        >
          <option value="all">All Sources</option>
          <option value="arxiv">arXiv Preprints</option>
          <option value="upload">Uploaded PDFs</option>
        </select>

        {/* Sort dropdown */}
        <select
          value={currentSort}
          onChange={(e) => handleSortChange && handleSortChange(e.target.value)}
          className="text-xs bg-[#23263A] hover:bg-[#2B2F46] border border-white/10 rounded-xl px-3 py-2 text-[#F8FAFC] font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500/30 shadow-xs cursor-pointer transition"
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
        <div className="flex items-center border border-white/10 rounded-xl p-0.5 bg-[#161827]">
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-violet-600 text-white shadow-xs font-bold'
                : 'text-[#71758B] hover:text-[#F8FAFC]'
            }`}
            title="Grid View"
            aria-label="Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              viewMode === 'list'
                ? 'bg-violet-600 text-white shadow-xs font-bold'
                : 'text-[#71758B] hover:text-[#F8FAFC]'
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
