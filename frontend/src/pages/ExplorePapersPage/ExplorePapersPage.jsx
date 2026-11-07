import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FilePlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import papersService from '../../services/papers.service';
import PageHeader from '../../components/layout/PageHeader';
import PaperFilters from '../../components/papers/PaperFilters';
import PaperCard from '../../components/papers/PaperCard';
import PaperListItem from '../../components/papers/PaperListItem';
import PaperSummaryModal from '../../components/papers/PaperSummaryModal';
import PaperUploadModal from '../../components/papers/PaperUploadModal';
import Pagination from '../../components/common/Pagination';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import {
  LoadingSkeletonGrid,
  LoadingSkeletonList,
} from '../../components/common/LoadingSkeleton';

export default function ExplorePapersPage() {
  const { isAdmin, hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read query params from URL
  const urlQ = searchParams.get('q') || '';
  const urlTopic = searchParams.get('topic') || '';
  const urlSource = searchParams.get('source') || 'all';
  const urlSort = searchParams.get('sort') || 'created_at';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);

  // Search, filter & pagination state
  const [searchQuery, setSearchQuery] = useState(urlQ);
  const [selectedTopic, setSelectedTopic] = useState(urlTopic);
  const [selectedSource, setSelectedSource] = useState(urlSource);
  const [sortBy, setSortBy] = useState(urlSort);
  const [viewMode, setViewMode] = useState('grid');
  const [currentPage, setCurrentPage] = useState(urlPage);

  // Synchronize state when URL query parameters change (e.g., browser back/forward or navigation from navbar/sidebar)
  useEffect(() => {
    setSearchQuery(urlQ);
    setSelectedTopic(urlTopic);
    setSelectedSource(urlSource);
    setSortBy(urlSort);
    setCurrentPage(urlPage);
  }, [urlQ, urlTopic, urlSource, urlSort, urlPage]);

  // Data state
  const [papers, setPapers] = useState([]);
  const [totalPapers, setTotalPapers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals state
  const [summaryPaper, setSummaryPaper] = useState(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const canUpload = hasPermission('papers:upload') || isAdmin;
  const itemsPerPage = 9;

  const fetchPapers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: currentPage,
        limit: itemsPerPage,
        sort: sortBy,
      };

      if (searchQuery.trim()) params.search = searchQuery.trim();
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
  }, [currentPage, searchQuery, selectedTopic, selectedSource, sortBy]);

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers]);

  // Push state updates to URL query parameters
  const updateUrlParam = (key, value) => {
    const params = new URLSearchParams(searchParams);
    if (!value || value === 'all' || (key === 'sort' && value === 'created_at') || (key === 'page' && Number(value) <= 1)) {
      params.delete(key);
    } else {
      params.set(key, String(value).trim());
    }
    // If updating a search/filter, reset page back to 1
    if (key !== 'page') {
      params.delete('page');
    }
    setSearchParams(params, { replace: true });
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedTopic('');
    setSelectedSource('all');
    setSortBy('created_at');
    setCurrentPage(1);
    setSearchParams({}, { replace: true });
  };

  const handleUploadSuccess = () => {
    setUploadModalOpen(false);
    fetchPapers();
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <PageHeader
        title="Explore Research Papers"
        description="Search, filter, and inspect peer-reviewed publications and preprints with AI insights."
      />

      {/* Filter and Search Bar */}
      <PaperFilters
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          updateUrlParam('q', q);
        }}
        selectedTopic={selectedTopic}
        onTopicChange={(t) => {
          setSelectedTopic(t);
          updateUrlParam('topic', t);
        }}
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

      {/* Papers Listing View */}
      {loading ? (
        viewMode === 'grid' ? (
          <LoadingSkeletonGrid count={6} />
        ) : (
          <LoadingSkeletonList count={6} />
        )
      ) : error ? (
        <ErrorState
          title="Could not load papers"
          message={error}
          onRetry={fetchPapers}
        />
      ) : papers.length === 0 ? (
        <EmptyState
          title="No research papers found"
          description={
            searchQuery || selectedTopic || selectedSource !== 'all'
              ? 'No papers matched your search criteria. Try modifying or clearing your filters.'
              : 'There are currently no research papers available in the explorer.'
          }
          icon={FilePlus}
          actionLabel={
            searchQuery || selectedTopic || selectedSource !== 'all'
              ? 'Reset All Filters'
              : canUpload
              ? 'Upload New Paper'
              : undefined
          }
          onAction={
            searchQuery || selectedTopic || selectedSource !== 'all'
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
