import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  FilePlus,
  BookOpen,
  FolderTree,
  Search,
  ExternalLink,
  ChevronRight,
  User,
  Calendar,
  Tag,
  ArrowRight,
  FileText,
  MapPin,
  Sparkles,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import papersService from '../../services/papers.service';
import tagsService from '../../services/tags.service';
import PageHeader from '../../components/layout/PageHeader';
import PaperFilters from '../../components/papers/PaperFilters';
import PaperCard from '../../components/papers/PaperCard';
import PaperListItem from '../../components/papers/PaperListItem';
import PaperSummaryModal from '../../components/papers/PaperSummaryModal';
import PaperUploadModal from '../../components/papers/PaperUploadModal';
import Pagination from '../../components/common/Pagination';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import {
  LoadingSkeletonGrid,
  LoadingSkeletonList,
} from '../../components/common/LoadingSkeleton';
import { formatDate } from '../../utils/formatters';

export default function ExplorePapersPage() {
  const { isAdmin, hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Read URL query parameters
  const validTabs = ['papers', 'topics'];
  const rawTab = searchParams.get('tab');
  const urlTab = validTabs.includes(rawTab) ? rawTab : 'papers';
  const urlQ = searchParams.get('q') || '';
  const urlTopic = searchParams.get('topic') || '';
  const urlSource = searchParams.get('source') || 'all';
  const urlSort = searchParams.get('sort') || 'newest';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);

  // Active view tab ('papers' | 'topics')
  const [activeTab, setActiveTab] = useState(urlTab);

  // Filter & Search state
  const [searchInput, setSearchInput] = useState(urlQ);
  const [debouncedSearch, setDebouncedSearch] = useState(urlQ);
  const [selectedTopic, setSelectedTopic] = useState(urlTopic);
  const [selectedSource, setSelectedSource] = useState(urlSource);
  const [sortBy, setSortBy] = useState(urlSort);
  const [viewMode, setViewMode] = useState('grid');
  const [currentPage, setCurrentPage] = useState(urlPage);

  // Data state
  const [papers, setPapers] = useState([]);
  const [totalPapers, setTotalPapers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Taxonomy & Topics state
  const [tagTree, setTagTree] = useState([]);
  const [flatTags, setFlatTags] = useState([]);
  const [activeTopicForExplorer, setActiveTopicForExplorer] = useState(null);

  // Modals state
  const [summaryPaper, setSummaryPaper] = useState(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const canUpload = hasPermission('papers:upload') || isAdmin;
  const itemsPerPage = 9;

  // ── Debounce Search Input (300ms) for paper search ──────────────────
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Synchronize state when URL query changes from outside (e.g. forward/back navigation)
  useEffect(() => {
    setActiveTab(urlTab);
    if (urlQ !== searchInput && urlQ !== debouncedSearch) {
      setSearchInput(urlQ);
      setDebouncedSearch(urlQ);
    }
    setSelectedTopic(urlTopic);
    setSelectedSource(urlSource);
    setSortBy(urlSort);
    setCurrentPage(urlPage);
  }, [urlTab, urlQ, urlTopic, urlSource, urlSort, urlPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push debounced search to URL query params safely without breaking in-flight typing
  useEffect(() => {
    const currentQ = searchParams.get('q') || '';
    if (debouncedSearch.trim() !== currentQ.trim()) {
      const params = new URLSearchParams(searchParams);
      if (debouncedSearch.trim()) {
        params.set('q', debouncedSearch.trim());
      } else {
        params.delete('q');
      }
      setSearchParams(params, { replace: true });
    }
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push state updates to URL parameters
  const updateUrlParam = (key, value) => {
    const params = new URLSearchParams(searchParams);
    if (!value || value === 'all' || (key === 'sort' && value === 'newest') || (key === 'page' && Number(value) <= 1) || (key === 'tab' && value === 'papers')) {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
    if (key !== 'page') {
      params.delete('page');
    }
    setSearchParams(params, { replace: true });
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    updateUrlParam('tab', tab);
  };

  // ── 1. Load Taxonomy Tree (FR-10) ─────────────────────────────────────────
  useEffect(() => {
    tagsService
      .getTagTree()
      .then((tree) => {
        setTagTree(tree || []);
        const flat = [];
        const walk = (nodes, currentPath = '') => {
          for (const node of nodes) {
            const fullPath = currentPath ? `${currentPath} > ${node.name}` : node.name;
            flat.push({
              ...node,
              canonicalPath: fullPath,
            });
            if (node.children && node.children.length > 0) {
              walk(node.children, fullPath);
            }
          }
        };
        walk(tree || []);
        setFlatTags(flat);
        if (flat.length > 0 && !activeTopicForExplorer) {
          setActiveTopicForExplorer(flat[0]);
        }
      })
      .catch((err) => console.warn('Failed to load taxonomy tree:', err));
  }, []);

  // ── 2. Fetch Papers with Backend Search & Filters ──────────────────────────
  const fetchPapers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: currentPage,
        limit: itemsPerPage,
        sort: sortBy,
      };

      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (selectedTopic) params.topic = selectedTopic;
      if (selectedSource && selectedSource !== 'all') params.source = selectedSource;

      const res = await papersService.getPapers(params);
      const paperList = res.papers || res.data || (Array.isArray(res) ? res : []);
      setPapers(paperList);
      setTotalPapers(res.total || paperList.length);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.message ||
          'Failed to retrieve research papers from the server.'
      );
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, selectedTopic, selectedSource, sortBy]);

  useEffect(() => {
    if (activeTab === 'papers') {
      fetchPapers();
    }
  }, [fetchPapers, activeTab]);

  // ── 3. Papers for Selected Topic in Topic Explorer ─────────────────────────
  const [topicExplorerPapers, setTopicExplorerPapers] = useState([]);
  const [loadingTopicPapers, setLoadingTopicPapers] = useState(false);

  useEffect(() => {
    if (activeTab === 'topics' && activeTopicForExplorer) {
      setLoadingTopicPapers(true);
      papersService
        .getPapers({ topic: activeTopicForExplorer.id, limit: 30 })
        .then((res) => {
          setTopicExplorerPapers(res.papers || []);
        })
        .catch((err) => {
          console.warn('Failed to load topic papers:', err);
        })
        .finally(() => {
          setLoadingTopicPapers(false);
        });
    }
  }, [activeTab, activeTopicForExplorer]);

  const handleResetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setSelectedTopic('');
    setSelectedSource('all');
    setSortBy('newest');
    setCurrentPage(1);
    setSearchParams({}, { replace: true });
  };

  const handleUploadSuccess = () => {
    setUploadModalOpen(false);
    fetchPapers();
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Page Header */}
      <PageHeader
        title="ScholarSphere Research Explorer"
        description="Explore research papers, browse hierarchical scientific topics, and discover granular paragraph insights across preprints."
        actions={
          canUpload && (
            <Button
              variant="primary"
              size="sm"
              iconLeft={FilePlus}
              onClick={() => setUploadModalOpen(true)}
              className="gap-1.5 shadow-xs"
            >
              <span>Upload Research Paper</span>
            </Button>
          )
        }
      />

      {/* Discovery Navigation Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex space-x-2 sm:space-x-4 overflow-x-auto scrollbar-none" aria-label="Explorer Tabs">
          <button
            type="button"
            onClick={() => handleTabChange('papers')}
            className={`py-3 px-3 border-b-2 text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'papers'
                ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Papers Explorer</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {totalPapers}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('topics')}
            className={`py-3 px-3 border-b-2 text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'topics'
                ? 'border-purple-600 text-purple-700 dark:text-purple-400 font-bold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
            }`}
          >
            <FolderTree className="w-4 h-4 text-purple-500" />
            <span>Topic Explorer (FR-10)</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
              {flatTags.length} Topics
            </span>
          </button>


        </nav>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 1: PAPERS EXPLORER
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'papers' && (
        <div className="space-y-4">
          <PaperFilters
            searchQuery={searchInput}
            onSearchChange={(q) => {
              setSearchInput(q);
            }}
            selectedTopic={selectedTopic}
            onTopicChange={(t) => {
              setSelectedTopic(t);
              updateUrlParam('topic', t);
            }}
            topics={flatTags}
            selectedSource={selectedSource}
            onSourceChange={(s) => {
              setSelectedSource(s);
              updateUrlParam('source', s);
            }}
            sortBy={sortBy}
            onSortChange={(s) => {
              setSortBy(s);
              updateUrlParam('sort', s);
            }}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onReset={handleResetFilters}
          />

          {loading ? (
            viewMode === 'grid' ? (
              <LoadingSkeletonGrid count={6} />
            ) : (
              <LoadingSkeletonList count={6} />
            )
          ) : error ? (
            <ErrorState
              title="Could not load research papers"
              message={error}
              onRetry={fetchPapers}
            />
          ) : papers.length === 0 ? (
            <EmptyState
              title="No research papers found"
              description={
                debouncedSearch || selectedTopic || selectedSource !== 'all'
                  ? 'No papers matched your search query. Try clearing filters or searching by author, topic, or abstract.'
                  : 'There are currently no research papers available in the explorer.'
              }
              icon={BookOpen}
              actionLabel={
                debouncedSearch || selectedTopic || selectedSource !== 'all'
                  ? 'Reset All Filters'
                  : canUpload
                  ? 'Upload New Paper'
                  : undefined
              }
              onAction={
                debouncedSearch || selectedTopic || selectedSource !== 'all'
                  ? handleResetFilters
                  : canUpload
                  ? () => setUploadModalOpen(true)
                  : undefined
              }
            />
          ) : (
            <>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {papers.map((paper) => (
                    <PaperCard
                      key={paper.id}
                      paper={paper}
                      onOpenSummary={(p) => setSummaryPaper(p)}
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 shadow-xs">
                  {papers.map((paper) => (
                    <PaperListItem
                      key={paper.id}
                      paper={paper}
                      onOpenSummary={(p) => setSummaryPaper(p)}
                    />
                  ))}
                </div>
              )}

              {/* Pagination */}
              <div className="pt-4">
                <Pagination
                  currentPage={currentPage}
                  totalItems={totalPapers}
                  itemsPerPage={itemsPerPage}
                  onPageChange={(p) => {
                    setCurrentPage(p);
                    updateUrlParam('page', p);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: TOPIC EXPLORER (FR-10 Knowledge Base)
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'topics' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (4 cols): Topic Hierarchy Selector */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3 h-[750px] flex flex-col">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Taxonomy Topic Selector</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Select a topic to explore its research papers and child subtopics
              </p>
            </div>

            {/* Topics Scrollable Tree/List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {flatTags.map((t) => {
                const isSelected = activeTopicForExplorer?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setActiveTopicForExplorer(t)}
                    className={`p-2.5 rounded-xl border transition cursor-pointer text-left select-none ${
                      isSelected
                        ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-500 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {t.name}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/60 px-1.5 py-0.2 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-purple-600 dark:text-purple-400 truncate mt-1">
                      {t.canonicalPath}
                    </p>
                    {t.description && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                        {t.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column (8 cols): Papers Assigned to Active Topic */}
          <div className="lg:col-span-8 space-y-4">
            {activeTopicForExplorer ? (
              <>
                {/* Active Topic Banner */}
                <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                      Topic Hierarchy Path
                    </span>
                    <Badge variant="purple" size="xs">
                      {activeTopicForExplorer.slug}
                    </Badge>
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                    {activeTopicForExplorer.canonicalPath}
                  </h2>
                  {activeTopicForExplorer.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {activeTopicForExplorer.description}
                    </p>
                  )}
                  <div className="pt-2 flex items-center gap-3 text-xs text-slate-500">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {topicExplorerPapers.length} Research Paper{topicExplorerPapers.length === 1 ? '' : 's'} Categorized
                    </span>
                  </div>
                </div>

                {/* Papers List */}
                {loadingTopicPapers ? (
                  <LoadingSkeletonGrid count={4} />
                ) : topicExplorerPapers.length === 0 ? (
                  <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 space-y-2">
                    <Tag className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="font-bold text-slate-700 dark:text-slate-300">
                      No papers tagged under "{activeTopicForExplorer.name}" yet
                    </p>
                    <p>Open any paper in the workspace or tagging tool to assign this topic tag.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {topicExplorerPapers.map((paper) => (
                      <PaperCard
                        key={paper.id}
                        paper={paper}
                        onOpenSummary={(p) => setSummaryPaper(p)}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500">
                Select a topic from the left to view categorized research papers.
              </div>
            )}
          </div>
        </div>
      )}


      {/* AI Perspectives Summary Modal */}
      <PaperSummaryModal
        paper={summaryPaper}
        isOpen={Boolean(summaryPaper)}
        onClose={() => setSummaryPaper(null)}
      />

      {/* Upload Paper Modal */}
      <PaperUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}
