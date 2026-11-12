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

  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-6 p-3 bg-white rounded-xl border border-slate-300 shadow-xs">
      {/* Search Input */}
      <div className="flex-1 min-w-[240px]">
        <SearchInput
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search by title, authors, abstract, arXiv ID..."
          shortcutKey="/"
        />
      </div>

      {/* Filter and Sort controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Source Filter */}
        <select
          value={currentSource}
          onChange={(e) => handleSourceChange && handleSourceChange(e.target.value)}
          className="text-xs bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-2xs cursor-pointer"
        >
          <option value="all">All Sources</option>
          <option value="arxiv">arXiv Only</option>
          <option value="upload">Direct PDF Uploads</option>
        </select>

        {/* Sort dropdown */}
        <select
          value={currentSort}
          onChange={(e) => handleSortChange && handleSortChange(e.target.value)}
          className="text-xs bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-2xs cursor-pointer"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="title_asc">Title (A-Z)</option>
          <option value="title_desc">Title (Z-A)</option>
          <option value="size_desc">File Size (Largest)</option>
        </select>

        {/* Reset Filters button */}
        {(searchQuery || currentSource !== 'all' || (currentSort !== 'newest' && currentSort !== 'created_at')) && (
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
        <div className="flex items-center border border-slate-300 rounded-lg p-0.5 bg-slate-100">
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            className={`p-1.5 rounded-md transition cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-white text-indigo-600 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
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
                ? 'bg-white text-indigo-600 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
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
