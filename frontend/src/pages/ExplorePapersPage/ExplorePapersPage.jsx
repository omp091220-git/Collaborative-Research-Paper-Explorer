import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import papersService from '../../services/papers.service';
import tagsService from '../../services/tags.service';
import PageHeader from '../../components/layout/PageHeader';
import PaperFilters from '../../components/papers/PaperFilters';
import PaperCard from '../../components/papers/PaperCard';
import PaperListItem from '../../components/papers/PaperListItem';
import PaperSummaryModal from '../../components/papers/PaperSummaryModal';
import PaperUploadModal from '../../components/papers/PaperUploadModal';
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

const EXPLORE_BATCH_SIZE = 12;

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

  // Active view tab ('papers' | 'topics')
  const [activeTab, setActiveTab] = useState(urlTab);

  // Filter & Search state
  const [searchInput, setSearchInput] = useState(urlQ);
  const [debouncedSearch, setDebouncedSearch] = useState(urlQ);
  const [selectedTopic, setSelectedTopic] = useState(urlTopic);
  const [selectedSource, setSelectedSource] = useState(urlSource);
  const [sortBy, setSortBy] = useState(urlSort);
  const [viewMode, setViewMode] = useState('grid');

  // Infinite Scroll & Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(null);
  const abortControllerRef = useRef(null);

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
  }, [urlTab, urlQ, urlTopic, urlSource, urlSort]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

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
    if (!value || value === 'all' || (key === 'sort' && value === 'newest') || (key === 'tab' && value === 'papers')) {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
    params.delete('page');
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

  // ── 2. Fetch Papers with Backend Search & Filters (Infinite Scroll Initial Batch) ────
  const fetchPapers = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    setPage(1);
    setHasMore(true);

    try {
      const params = {
        page: 1,
        limit: EXPLORE_BATCH_SIZE,
        sort: sortBy,
      };

      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (selectedTopic) params.topic = selectedTopic;
      if (selectedSource && selectedSource !== 'all') params.source = selectedSource;

      const res = await papersService.getPapers(params, { signal: controller.signal });
      const paperList = res.papers || res.data?.papers || (Array.isArray(res) ? res : []);
      const total = res.total ?? res.pagination?.total ?? paperList.length;

      setPapers(paperList);
      setTotalPapers(total);
      setPage(1);

      const hasNext = res.pagination?.hasNextPage ?? (paperList.length >= EXPLORE_BATCH_SIZE && paperList.length < total);
      setHasMore(Boolean(hasNext));
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
        return;
      }
      setError(
        err.response?.data?.error ||
          err.message ||
          'Failed to retrieve research papers from the server.'
      );
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedTopic, selectedSource, sortBy]);

  const loadMorePapers = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;

    setLoadingMore(true);
    setLoadMoreError(null);
    const nextPage = page + 1;

    try {
      const params = {
        page: nextPage,
        limit: EXPLORE_BATCH_SIZE,
        sort: sortBy,
      };

      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (selectedTopic) params.topic = selectedTopic;
      if (selectedSource && selectedSource !== 'all') params.source = selectedSource;

      const res = await papersService.getPapers(params);
      const nextBatch = res.papers || res.data?.papers || (Array.isArray(res) ? res : []);

      if (nextBatch.length === 0) {
        setHasMore(false);
      } else {
        setPapers((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const uniqueNew = nextBatch.filter((p) => !existingIds.has(p.id));
          return [...prev, ...uniqueNew];
        });

        const total = res.total ?? res.pagination?.total ?? (papers.length + nextBatch.length);
        setTotalPapers(total);

        const hasNext = res.pagination?.hasNextPage ?? (nextBatch.length >= EXPLORE_BATCH_SIZE);
        setHasMore(Boolean(hasNext));
        setPage(nextPage);
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
        return;
      }
      setLoadMoreError(
        err.response?.data?.error ||
          err.message ||
          'Failed to load more papers.'
      );
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, hasMore, page, papers.length, debouncedSearch, selectedTopic, selectedSource, sortBy]);

  const sentinelRef = useInfiniteScroll({
    onIntersect: loadMorePapers,
    enabled: hasMore && !loading && !loadingMore && !loadMoreError && activeTab === 'papers',
  });

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
      <div className="border-b border-theme-subtle">
        <nav className="flex space-x-2 sm:space-x-4 overflow-x-auto scrollbar-none" aria-label="Explorer Tabs">
          <button
            type="button"
            onClick={() => handleTabChange('papers')}
            className={`py-3.5 px-3 border-b-2 text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'papers'
                ? 'border-violet-500 text-violet-400 font-bold'
                : 'border-transparent text-theme-muted hover:text-theme-main font-medium'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Papers Explorer</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-theme-elevated text-theme-secondary border border-white/10">
              {totalPapers}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('topics')}
            className={`py-3.5 px-3 border-b-2 text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'topics'
                ? 'border-cyan-400 text-cyan-300 font-bold'
                : 'border-transparent text-theme-muted hover:text-theme-main font-medium'
            }`}
          >
            <FolderTree className="w-4 h-4 text-cyan-400" />
            <span>Topic Explorer (FR-10)</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
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
                <div className="space-y-3">
                  {papers.map((paper) => (
                    <PaperListItem
                      key={paper.id}
                      paper={paper}
                      onOpenSummary={(p) => setSummaryPaper(p)}
                    />
                  ))}
                </div>
              )}

              {/* Infinite Scroll Indicators & Sentinel */}
              {loadingMore && (
                <div className="mt-4 space-y-3">
                  {viewMode === 'grid' ? (
                    <LoadingSkeletonGrid count={3} />
                  ) : (
                    <LoadingSkeletonList count={3} />
                  )}
                  <div className="flex items-center justify-center gap-2 text-xs text-theme-muted py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                    <span>Loading more papers...</span>
                  </div>
                </div>
              )}

              {loadMoreError && (
                <div className="mt-4 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center justify-between">
                  <span>{loadMoreError}</span>
                  <button
                    type="button"
                    onClick={loadMorePapers}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!hasMore && papers.length > 0 && (
                <div className="mt-8 text-center text-xs text-theme-muted py-4 border-t border-theme-subtle">
                  You've reached the end of the collection.
                </div>
              )}

              <div ref={sentinelRef} className="h-4 w-full" />
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
          <div className="lg:col-span-4 bg-theme-card rounded-2xl border border-theme-subtle p-4 shadow-xs space-y-3 h-[750px] flex flex-col">
            <div className="border-b border-theme-subtle pb-2">
              <h3 className="text-sm font-bold text-theme-main flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-violet-400" />
                <span>Taxonomy Topic Selector</span>
              </h3>
              <p className="text-xs text-theme-muted mt-0.5">
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
                        ? 'bg-violet-500/15 border-violet-500 shadow-xs'
                        : 'border-theme-subtle hover:border-theme-strong bg-theme-elevated'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-theme-main">
                        {t.name}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] font-bold text-violet-300 bg-violet-500/20 px-1.5 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-violet-400 truncate mt-1">
                      {t.canonicalPath}
                    </p>
                    {t.description && (
                      <p className="text-[11px] text-theme-muted line-clamp-1 mt-0.5">
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
                <div className="p-5 bg-theme-card rounded-2xl border border-theme-subtle shadow-xs space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-violet-400">
                      Topic Hierarchy Path
                    </span>
                    <Badge variant="violet" size="xs">
                      {activeTopicForExplorer.slug}
                    </Badge>
                  </div>
                  <h2 className="text-xl font-extrabold text-theme-main">
                    {activeTopicForExplorer.canonicalPath}
                  </h2>
                  {activeTopicForExplorer.description && (
                    <p className="text-xs text-theme-secondary">
                      {activeTopicForExplorer.description}
                    </p>
                  )}
                  <div className="pt-2 flex items-center gap-3 text-xs text-theme-muted">
                    <span className="font-semibold text-theme-main">
                      {topicExplorerPapers.length} Research Paper{topicExplorerPapers.length === 1 ? '' : 's'} Categorized
                    </span>
                  </div>
                </div>

                {/* Papers List */}
                {loadingTopicPapers ? (
                  <LoadingSkeletonGrid count={4} />
                ) : topicExplorerPapers.length === 0 ? (
                  <div className="p-12 text-center bg-theme-card rounded-2xl border border-theme-subtle text-xs text-theme-muted space-y-2">
                    <Tag className="w-8 h-8 text-theme-muted mx-auto" />
                    <p className="font-bold text-theme-main">
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
              <div className="p-12 text-center bg-theme-card rounded-2xl border border-theme-subtle text-theme-muted">
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
