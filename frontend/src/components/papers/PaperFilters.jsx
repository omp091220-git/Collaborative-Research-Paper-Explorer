import { LayoutGrid, List, RotateCcw } from 'lucide-react';
import SearchInput from '../common/SearchInput';
import Button from '../common/Button';

export default function PaperFilters({
  searchQuery,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  sortBy,
  onSortByChange,
  viewMode,
  onViewModeChange,
  onReset,
}) {
  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-6 p-3 bg-white rounded-xl border border-slate-200/90 shadow-2xs">
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
          value={filterType}
          onChange={(e) => onFilterTypeChange(e.target.value)}
          className="text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
        >
          <option value="all">All Sources</option>
          <option value="arxiv">arXiv Only</option>
          <option value="upload">Direct PDF Uploads</option>
        </select>

        {/* Sort dropdown */}
        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value)}
          className="text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="title_asc">Title (A-Z)</option>
          <option value="title_desc">Title (Z-A)</option>
          <option value="size_desc">File Size (Largest)</option>
        </select>

        {/* Reset Filters button */}
        {(searchQuery || filterType !== 'all' || sortBy !== 'newest') && (
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
        <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50">
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            className={`p-1.5 rounded-md transition cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-white text-indigo-600 shadow-2xs font-semibold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
            title="Grid View"
            aria-label="Grid View"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            className={`p-1.5 rounded-md transition cursor-pointer ${
              viewMode === 'list'
                ? 'bg-white text-indigo-600 shadow-2xs font-semibold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
            title="List View"
            aria-label="List View"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
