import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  FilePlus,
  BookOpen,
  FolderTree,
  Quote,
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
  const urlTab = searchParams.get('tab') || 'papers'; // 'papers' | 'topics' | 'paragraphs' | 'search'
  const urlQ = searchParams.get('q') || '';
  const urlTopic = searchParams.get('topic') || '';
  const urlSource = searchParams.get('source') || 'all';
  const urlSort = searchParams.get('sort') || 'newest';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);

  // Active view tab
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

  // Unified Search State
  const [unifiedResults, setUnifiedResults] = useState({
    papers: [],
    topics: [],
    paragraphs: [],
    total: 0,
  });
  const [loadingUnified, setLoadingUnified] = useState(false);
  const [unifiedError, setUnifiedError] = useState(null);
  const [unifiedFilterType, setUnifiedFilterType] = useState('all'); // 'all' | 'papers' | 'topics' | 'paragraphs'

  // Paragraph Explorer state
  const [allParagraphs, setAllParagraphs] = useState([]);
  const [loadingParagraphs, setLoadingParagraphs] = useState(false);
  const [paragraphError, setParagraphError] = useState(null);
  const [paragraphQuery, setParagraphQuery] = useState('');
  const [debouncedParagraphQuery, setDebouncedParagraphQuery] = useState('');
  const [paragraphTopicFilter, setParagraphTopicFilter] = useState('');

  // Modals state
  const [summaryPaper, setSummaryPaper] = useState(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const canUpload = hasPermission('papers:upload') || isAdmin;
  const itemsPerPage = 9;

  // ── Debounce Search Input (300ms) for main/unified search ──────────────────
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // ── Debounce Paragraph Query (300ms) for paragraph explorer ─────────────────
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedParagraphQuery(paragraphQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [paragraphQuery]);

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

  // ── 3. Unified Cross-Search Across Papers, Topics, and Paragraphs ──────────
  const activeSearchIdRef = useRef(0);

  const fetchUnifiedSearch = useCallback(async (query) => {
    const searchId = ++activeSearchIdRef.current;
    const trimmed = (query || '').trim();
    if (!trimmed) {
      setUnifiedResults({ papers: [], topics: [], paragraphs: [], total: 0 });
      setLoadingUnified(false);
      setUnifiedError(null);
      return;
    }

    setLoadingUnified(true);
    setUnifiedError(null);
    try {
      const res = await papersService.searchUnified(trimmed, unifiedFilterType, 30);
      if (searchId !== activeSearchIdRef.current) return;
      const papers = res?.papers || [];
      const topics = res?.topics || [];
      const paragraphs = res?.paragraphs || [];
      const total = res?.total ?? (papers.length + topics.length + paragraphs.length);
      setUnifiedResults({ papers, topics, paragraphs, total });
    } catch (err) {
      if (searchId !== activeSearchIdRef.current) return;
      console.warn('Unified search error:', err);
      setUnifiedError(
        err.response?.data?.error || err.message || 'Failed to complete search query.'
      );
    } finally {
      if (searchId === activeSearchIdRef.current) {
        setLoadingUnified(false);
      }
    }
  }, [unifiedFilterType]);

  useEffect(() => {
    if (activeTab === 'search') {
      fetchUnifiedSearch(debouncedSearch);
    }
  }, [activeTab, debouncedSearch, fetchUnifiedSearch]);

  // ── 4. Fetch Paragraphs for Paragraph Explorer ─────────────────────────────
  const activeParaSearchIdRef = useRef(0);

  const fetchParagraphs = useCallback(async () => {
    const reqId = ++activeParaSearchIdRef.current;
    setLoadingParagraphs(true);
    setParagraphError(null);
    try {
      const res = await papersService.searchUnified(
        (debouncedParagraphQuery || '').trim(),
        'paragraphs',
        50,
        paragraphTopicFilter
      );
      if (reqId !== activeParaSearchIdRef.current) return;
      setAllParagraphs(res?.paragraphs || []);
    } catch (err) {
      if (reqId !== activeParaSearchIdRef.current) return;
      console.warn('Failed to load paragraphs for explorer:', err);
      setParagraphError(
        err.response?.data?.error || err.message || 'Failed to retrieve paragraphs.'
      );
    } finally {
      if (reqId === activeParaSearchIdRef.current) {
        setLoadingParagraphs(false);
      }
    }
  }, [debouncedParagraphQuery, paragraphTopicFilter]);

  useEffect(() => {
    if (activeTab === 'paragraphs') {
      fetchParagraphs();
    }
  }, [activeTab, fetchParagraphs]);

  // ── 5. Papers for Selected Topic in Topic Explorer ─────────────────────────
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

          <button
            type="button"
            onClick={() => handleTabChange('paragraphs')}
            className={`py-3 px-3 border-b-2 text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'paragraphs'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
            }`}
          >
            <Quote className="w-4 h-4 text-emerald-500" />
            <span>Paragraph Explorer (FR-11)</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('search')}
            className={`py-3 px-3 border-b-2 text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'search'
                ? 'border-amber-500 text-amber-700 dark:text-amber-400 font-bold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
            }`}
          >
            <Search className="w-4 h-4 text-amber-500" />
            <span>Unified Search</span>
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

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 3: PARAGRAPH EXPLORER (FR-11 Granular Comparisons)
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'paragraphs' && (
        <ErrorBoundary title="Paragraph Explorer Error">
          <div className="space-y-4">
            {/* Header controls: Search input & Topic filter */}
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={paragraphQuery}
                    onChange={(e) => setParagraphQuery(e.target.value)}
                    placeholder="Search across all tagged paragraphs, paper titles, and authors..."
                    className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                  {paragraphQuery && (
                    <button
                      type="button"
                      onClick={() => setParagraphQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      title="Clear paragraph search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Topic Tag Filter */}
                <div className="w-full sm:w-56 shrink-0">
                  <select
                    value={paragraphTopicFilter}
                    onChange={(e) => setParagraphTopicFilter(e.target.value)}
                    className="w-full py-2 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 cursor-pointer font-medium"
                    aria-label="Filter paragraphs by topic tag"
                  >
                    <option value="">All Scientific Topics</option>
                    {(flatTags || []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.canonicalPath || t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="text-xs text-slate-500 font-medium whitespace-nowrap self-end sm:self-center">
                {allParagraphs.length} Cross-Paper Paragraph{allParagraphs.length === 1 ? '' : 's'}
              </div>
            </div>

            {/* Error State */}
            {paragraphError && (
              <ErrorState
                title="Failed to Load Paragraphs"
                message={paragraphError}
                onRetry={fetchParagraphs}
              />
            )}

            {/* Loading State */}
            {loadingParagraphs ? (
              <LoadingSkeletonList count={5} />
            ) : allParagraphs.length === 0 ? (
              <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 space-y-3">
                <Quote className="w-10 h-10 text-emerald-500/60 mx-auto" />
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                  {paragraphQuery || paragraphTopicFilter
                    ? 'No matching paragraphs found'
                    : 'No Tagged Paragraphs Found'}
                </h3>
                <p className="max-w-md mx-auto">
                  {paragraphQuery || paragraphTopicFilter
                    ? `No paragraphs match "${paragraphQuery || 'the selected topic filter'}". Try clearing the filter or searching for a different keyword.`
                    : 'Select text passages in any PDF paper and click "Assign Tag" in the floating toolbar to save granular paragraph insights that appear here for comparative research.'}
                </p>
                {(paragraphQuery || paragraphTopicFilter) && (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setParagraphQuery('');
                        setParagraphTopicFilter('');
                      }}
                    >
                      Clear Search & Topic Filter
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {allParagraphs.map((para) => (
                  <div
                    key={para.annotationId}
                    className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Link
                            to={`/papers/${para.paperId}?tab=pdf&page=${para.pageNumber}&annotationId=${para.annotationId}`}
                            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>{para.paperTitle}</span>
                          </Link>
                          <Badge variant="blue" size="xs">
                            Page {para.pageNumber}
                          </Badge>
                          {para.publicationYear && (
                            <Badge variant="slate" size="xs">
                              {para.publicationYear}
                            </Badge>
                          )}
                        </div>

                        {para.paperAuthors && (
                          <p className="text-[11px] text-slate-500 flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            <span>
                              {Array.isArray(para.paperAuthors)
                                ? para.paperAuthors.join(', ')
                                : para.paperAuthors}
                            </span>
                          </p>
                        )}
                      </div>

                      <Link
                        to={`/papers/${para.paperId}?tab=pdf&page=${para.pageNumber}&annotationId=${para.annotationId}`}
                      >
                        <Button variant="secondary" size="xs" iconRight={ArrowRight}>
                          <span>Read in PDF</span>
                        </Button>
                      </Link>
                    </div>

                    {/* Paragraph Quote Text */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-950/70 border-l-4 border-emerald-500 rounded-r-xl text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans italic">
                      "{para.content}"
                    </div>

                    {/* Assigned Topic Tags */}
                    {para.tags && para.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
                          Topic Tags:
                        </span>
                        {para.tags.map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/80 border border-purple-200 dark:border-purple-800/80 text-[10px] font-bold text-purple-700 dark:text-purple-300"
                          >
                            <Tag className="w-2.5 h-2.5 text-purple-500" />
                            <span>{t.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ErrorBoundary>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 4: UNIFIED CROSS-SEARCH
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'search' && (
        <ErrorBoundary title="Unified Search Error">
          <div className="space-y-4">
            {/* Search Input Bar */}
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                  }}
                  placeholder="Search across research titles, authors, abstracts, topic tags, and paragraph notes..."
                  className="w-full pl-9 pr-8 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  autoFocus
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setDebouncedSearch('');
                      const params = new URLSearchParams(searchParams);
                      params.delete('q');
                      setSearchParams(params, { replace: true });
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Clear search query"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Sub-filter pills */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="font-bold text-slate-500">Filter Domain:</span>
                {['all', 'papers', 'topics', 'paragraphs'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setUnifiedFilterType(t)}
                    className={`px-3 py-1 rounded-lg font-bold text-xs capitalize transition cursor-pointer ${
                      unifiedFilterType === t
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {t === 'all' ? 'All Matches' : t}
                  </button>
                ))}
              </div>
            </div>

            {/* Error State */}
            {unifiedError && (
              <ErrorState
                title="Search Query Failed"
                message={unifiedError}
                onRetry={() => fetchUnifiedSearch(debouncedSearch)}
              />
            )}

            {/* Unified Search Results */}
            {loadingUnified ? (
              <div className="py-16 text-center text-xs text-slate-500 space-y-2">
                <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Searching research knowledge base...</p>
              </div>
            ) : !debouncedSearch.trim() ? (
              <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 space-y-2">
                <Search className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  Enter any term, author, or keyword
                </p>
                <p className="text-xs">
                  Unified search returns matching paper preprints, hierarchical topic tags, and granular paragraph quotes.
                </p>
              </div>
            ) : (unifiedResults.total === 0 || (unifiedResults.papers?.length === 0 && unifiedResults.topics?.length === 0 && unifiedResults.paragraphs?.length === 0)) ? (
              <EmptyState
                title={`No results found for "${debouncedSearch}"`}
                description="Check your spelling or try searching for a broader term like 'attention', 'transformer', or 'neural'."
                icon={Search}
              />
            ) : (
              <div className="space-y-6">
                {/* Section 1: Papers Results */}
                {unifiedResults.papers && unifiedResults.papers.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-indigo-600" />
                      <span>Matching Research Papers ({unifiedResults.papers.length})</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {unifiedResults.papers.map((paper) => (
                        <PaperCard
                          key={paper.id}
                          paper={paper}
                          onOpenSummary={(p) => setSummaryPaper(p)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Section 2: Topic Tags Results */}
                {unifiedResults.topics && unifiedResults.topics.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <FolderTree className="w-4 h-4 text-purple-600" />
                      <span>Matching Scientific Topics ({unifiedResults.topics.length})</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {unifiedResults.topics.map((topic) => (
                        <div
                          key={topic.id}
                          onClick={() => {
                            setActiveTopicForExplorer(topic);
                            handleTabChange('topics');
                          }}
                          className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-purple-500 transition cursor-pointer shadow-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              {topic.name}
                            </span>
                            <span className="text-[10px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-1.5 py-0.2 rounded font-mono">
                              {topic.paper_count} papers
                            </span>
                          </div>
                          <p className="text-[10px] font-mono text-slate-500 truncate">
                            {topic.canonicalPath}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section 3: Paragraph Quotes Results */}
                {unifiedResults.paragraphs && unifiedResults.paragraphs.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Quote className="w-4 h-4 text-emerald-600" />
                      <span>Matching Paragraphs & Notes ({unifiedResults.paragraphs.length})</span>
                    </h3>
                    <div className="space-y-3">
                      {unifiedResults.paragraphs.map((para) => (
                        <div
                          key={para.annotationId}
                          className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Link
                                  to={`/papers/${para.paperId}?tab=pdf&page=${para.pageNumber}&annotationId=${para.annotationId}`}
                                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                                >
                                  <BookOpen className="w-3.5 h-3.5" />
                                  <span>{para.paperTitle}</span>
                                </Link>
                                <Badge variant="blue" size="xs">
                                  Page {para.pageNumber}
                                </Badge>
                                {para.publicationYear && (
                                  <Badge variant="slate" size="xs">
                                    {para.publicationYear}
                                  </Badge>
                                )}
                              </div>
                              {para.paperAuthors && (
                                <p className="text-[11px] text-slate-500 flex items-center gap-1">
                                  <User className="w-3 h-3 text-slate-400" />
                                  <span>
                                    {Array.isArray(para.paperAuthors)
                                      ? para.paperAuthors.join(', ')
                                      : para.paperAuthors}
                                  </span>
                                </p>
                              )}
                            </div>

                            <Link
                              to={`/papers/${para.paperId}?tab=pdf&page=${para.pageNumber}&annotationId=${para.annotationId}`}
                            >
                              <Button variant="secondary" size="xs" iconRight={ArrowRight}>
                                <span>Read in PDF</span>
                              </Button>
                            </Link>
                          </div>

                          <div className="p-3 bg-slate-50 dark:bg-slate-950/70 border-l-4 border-emerald-500 rounded-r-xl text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans italic">
                            "{para.content}"
                          </div>

                          {para.tags && para.tags.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
                                Topic Tags:
                              </span>
                              {para.tags.map((t) => (
                                <span
                                  key={t.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/80 border border-purple-200 dark:border-purple-800/80 text-[10px] font-bold text-purple-700 dark:text-purple-300"
                                >
                                  <Tag className="w-2.5 h-2.5 text-purple-500" />
                                  <span>{t.name}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ErrorBoundary>
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
