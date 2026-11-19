import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Upload,
  Globe,
  Lock,
  Users,
  Search,
  KeyRound,
  ExternalLink,
  Trash2,
  Calendar,
  AlertCircle,
  Tag,
  MessageSquare,
} from 'lucide-react';
import papersService from '../../services/papers.service';
import PageHeader from '../../components/layout/PageHeader';
import PaperUploadModal from '../../components/papers/PaperUploadModal';
import CollaboratorsModal from '../../components/CollaboratorsModal';
import PaperVisibilityToggle from '../../components/papers/PaperVisibilityToggle';
import Pagination from '../../components/common/Pagination';
import EmptyState from '../../components/common/EmptyState';
import { formatDate, formatAuthors } from '../../utils/formatters';

export default function MyPapersPage() {
  const [papers, setPapers] = useState([]);
  const [stats, setStats] = useState({
    total_papers: 0,
    public_papers: 0,
    private_papers: 0,
    total_collaborators: 0,
    pending_requests: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('ALL'); // 'ALL' | 'PUBLIC' | 'PRIVATE'
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedPaperForCollabs, setSelectedPaperForCollabs] = useState(null);
  const [paperToDelete, setPaperToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchMyPapers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit: 12,
        sort,
      };
      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }
      if (visibilityFilter !== 'ALL') {
        params.visibility = visibilityFilter;
      }

      const res = await papersService.getMyPapers(params);
      setPapers(res.papers || []);
      setStats(
        res.stats || {
          total_papers: 0,
          public_papers: 0,
          private_papers: 0,
          total_collaborators: 0,
          pending_requests: 0,
        }
      );
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          'Failed to load your papers. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [page, sort, debouncedSearch, visibilityFilter]);

  useEffect(() => {
    fetchMyPapers();
  }, [fetchMyPapers]);

  const handleDeletePaper = async () => {
    if (!paperToDelete) return;
    setDeleting(true);
    try {
      await papersService.deletePaper(paperToDelete.id);
      setPaperToDelete(null);
      fetchMyPapers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete paper.');
    } finally {
      setDeleting(false);
    }
  };

  const handleVisibilityChanged = (paperId, newVisibility) => {
    setPapers((prev) =>
      prev.map((p) => (p.id === paperId ? { ...p, visibility: newVisibility } : p))
    );
    // Refresh stats
    fetchMyPapers();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <PageHeader
        title="My Papers"
        subtitle="Manage your uploaded research papers, public and private visibility settings, and collaborator access."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition shadow-sm shadow-violet-600/25 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Upload or Import Paper</span>
            </button>
          </div>
        }
      />

      {/* Summary Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 bg-theme-card border border-theme-subtle rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-theme-muted mb-2">
            <span className="text-xs font-semibold">Total Uploaded</span>
            <FileText className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-2xl font-black text-theme-main">
            {stats.total_papers}
          </div>
          <p className="text-[11px] text-theme-muted mt-0.5">Papers in your lab</p>
        </div>

        <div className="p-4 bg-theme-card border border-theme-subtle rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-theme-muted mb-2">
            <span className="text-xs font-semibold">Public Papers</span>
            <Globe className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">
            {stats.public_papers}
          </div>
          <p className="text-[11px] text-theme-muted mt-0.5">Discoverable by all</p>
        </div>

        <div className="p-4 bg-theme-card border border-theme-subtle rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-theme-muted mb-2">
            <span className="text-xs font-semibold">Private Papers</span>
            <Lock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400">
            {stats.private_papers}
          </div>
          <p className="text-[11px] text-theme-muted mt-0.5">Approved access only</p>
        </div>

        <div className="p-4 bg-theme-card border border-theme-subtle rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-theme-muted mb-2">
            <span className="text-xs font-semibold">Collaborators</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-cyan-400">
            {stats.total_collaborators}
          </div>
          <p className="text-[11px] text-theme-muted mt-0.5">Active lab researchers</p>
        </div>

        <Link
          to="/access-requests"
          className="p-4 bg-theme-card border border-theme-subtle rounded-2xl shadow-xs hover:border-violet-500/40 transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-theme-muted mb-2">
            <span className="text-xs font-semibold group-hover:text-violet-400 transition">
              Pending Requests
            </span>
            <KeyRound className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-purple-400">
            {stats.pending_requests}
          </div>
          <p className="text-[11px] text-violet-400 group-hover:underline mt-0.5 flex items-center gap-1">
            <span>Review requests</span>
            <span>&rarr;</span>
          </p>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-theme-card border border-theme-subtle rounded-2xl shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-theme-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search your papers by title, abstract or authors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-theme-main placeholder:text-theme-muted"
          />
        </div>

        {/* Visibility Filter Pills */}
        <div className="flex items-center gap-1.5 self-center sm:self-auto">
          {['ALL', 'PUBLIC', 'PRIVATE'].map((vis) => (
            <button
              key={vis}
              type="button"
              onClick={() => {
                setVisibilityFilter(vis);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                visibilityFilter === vis
                  ? 'bg-violet-600 text-white shadow-xs'
                  : 'bg-theme-elevated text-theme-muted hover:text-theme-main hover:bg-theme-subtle'
              }`}
            >
              {vis}
            </button>
          ))}
        </div>

        {/* Sort selector */}
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl text-theme-main font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/40 cursor-pointer"
        >
          <option value="newest">Newest Uploads</option>
          <option value="oldest">Oldest Uploads</option>
          <option value="title_asc">Title (A - Z)</option>
          <option value="title_desc">Title (Z - A)</option>
        </select>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-2xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchMyPapers}
            className="text-xs font-semibold underline hover:text-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Papers Grid */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-theme-muted">Loading your research papers...</p>
        </div>
      ) : papers.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={
            debouncedSearch || visibilityFilter !== 'ALL'
              ? 'No matching papers found'
              : 'You have not uploaded any papers yet'
          }
          description={
            debouncedSearch || visibilityFilter !== 'ALL'
              ? 'Try modifying your search or visibility filter.'
              : 'Upload your research PDFs or import from arXiv to begin collaborating with other researchers.'
          }
          action={
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition shadow-sm cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Paper</span>
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {papers.map((paper) => (
            <div
              key={paper.id}
              className="bg-theme-card border border-theme-subtle rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-950/20 transition-all duration-200 group"
            >
              <div className="space-y-3">
                {/* Header: Visibility Toggle & Collaborator Pill */}
                <div className="flex items-center justify-between gap-2">
                  <PaperVisibilityToggle
                    paperId={paper.id}
                    initialVisibility={paper.visibility || 'PUBLIC'}
                    canManage={true}
                    onVisibilityChange={(newVis) =>
                      handleVisibilityChanged(paper.id, newVis)
                    }
                  />

                  <button
                    type="button"
                    onClick={() => setSelectedPaperForCollabs(paper)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-400 border border-violet-500/30 hover:bg-violet-500/25 transition cursor-pointer"
                    title="Manage Collaborators"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{paper.collaborator_count || 0}</span>
                  </button>
                </div>

                {/* Title */}
                <Link
                  to={`/papers/${paper.id}`}
                  className="block group-hover:text-violet-400 transition"
                >
                  <h3 className="text-sm font-bold text-theme-main leading-snug line-clamp-2 group-hover:text-violet-300">
                    {paper.title}
                  </h3>
                </Link>

                {/* Authors */}
                <p className="text-xs text-theme-secondary font-medium line-clamp-1">
                  {formatAuthors(paper.authors, 3)}
                </p>

                {/* Abstract Preview */}
                {paper.abstract && (
                  <p className="text-xs text-theme-muted line-clamp-3 leading-relaxed">
                    {paper.abstract}
                  </p>
                )}

                {/* Metadata badges: Upload date, Tags, Annotations */}
                <div className="flex items-center gap-3 text-[11px] text-theme-muted flex-wrap pt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDate(paper.uploaded_at, { shortMonth: true })}</span>
                  </span>

                  {paper.tag_count !== undefined && (
                    <span className="flex items-center gap-1" title="Tags">
                      <Tag className="w-3 h-3" />
                      <span>{paper.tag_count} tags</span>
                    </span>
                  )}

                  {paper.annotation_count !== undefined && (
                    <span className="flex items-center gap-1" title="Annotations">
                      <MessageSquare className="w-3 h-3" />
                      <span>{paper.annotation_count} notes</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-4 mt-4 border-t border-theme-subtle flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setPaperToDelete(paper)}
                  className="p-1.5 rounded-lg text-theme-muted hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                  title="Delete Paper"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPaperForCollabs(paper)}
                    className="px-3 py-1.5 rounded-xl border border-theme-subtle text-xs font-semibold text-theme-secondary hover:text-theme-main hover:bg-theme-elevated transition cursor-pointer"
                  >
                    Collaborators
                  </button>

                  <Link
                    to={`/papers/${paper.id}`}
                    className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition shadow-xs cursor-pointer"
                  >
                    <span>Open</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pt-4 flex justify-center">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(newPage) => setPage(newPage)}
          />
        </div>
      )}

      {/* Upload / Import Modal */}
      {showUploadModal && (
        <PaperUploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false);
            fetchMyPapers();
          }}
        />
      )}

      {/* Collaborator Management Modal */}
      {selectedPaperForCollabs && (
        <CollaboratorsModal
          paper={selectedPaperForCollabs}
          isOpen={Boolean(selectedPaperForCollabs)}
          onClose={() => {
            setSelectedPaperForCollabs(null);
            fetchMyPapers();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {paperToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-theme-card rounded-2xl shadow-2xl border border-theme-subtle w-full max-w-md p-6">
            <h3 className="text-base font-bold text-theme-main">
              Delete Research Paper?
            </h3>
            <p className="text-xs text-theme-muted mt-2 leading-relaxed">
              Are you sure you want to delete <strong className="text-theme-main">"{paperToDelete.title}"</strong>?
              This will remove the paper, its PDF file, collaborator permissions, annotations, and access requests.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPaperToDelete(null)}
                disabled={deleting}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-theme-elevated hover:bg-theme-subtle text-theme-secondary transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeletePaper}
                disabled={deleting}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
