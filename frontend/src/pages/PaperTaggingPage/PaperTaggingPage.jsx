import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  BookOpen,
  Search,
  RefreshCw,
  FolderTree,
  ExternalLink,
  Calendar,
  User,
  CheckCircle2,
  AlertCircle,
  Tag,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import papersService from '../../services/papers.service';
import tagsService from '../../services/tags.service';
import paperTagsService from '../../services/paperTags.service';
import annotationsService from '../../services/annotations.service';
import { getApiErrorMessage } from '../../services/api';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import ErrorState from '../../components/common/ErrorState';
import PaperTagSection from '../../components/tagging/PaperTagSection';
import AnnotationTagSection from '../../components/tagging/AnnotationTagSection';
import { formatDate } from '../../utils/formatters';

export default function PaperTaggingPage() {
  const { isAdmin, isResearcher } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const canAssign = isAdmin || isResearcher;

  // Selected paper ID from URL
  const selectedPaperIdFromUrl = searchParams.get('paperId');

  // Papers list state
  const [papers, setPapers] = useState([]);
  const [loadingPapers, setLoadingPapers] = useState(true);
  const [papersError, setPapersError] = useState(null);
  const [paperSearch, setPaperSearch] = useState('');

  // Selected paper and related data
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignmentError, setAssignmentError] = useState(null);

  // Shared Tag Tree
  const [tagTree, setTagTree] = useState([]);

  // Ref to track latest requested paperId and prevent stale responses
  const activePaperIdRef = useRef(null);

  // Fetch all papers from FR-6 backend
  const fetchPapers = useCallback(async () => {
    setLoadingPapers(true);
    setPapersError(null);
    try {
      const res = await papersService.getPapers({ limit: 100 });
      const paperList = res.papers || res.data || (Array.isArray(res) ? res : []);
      setPapers(paperList);
    } catch (err) {
      setPapersError(getApiErrorMessage(err, 'Failed to retrieve research papers.'));
    } finally {
      setLoadingPapers(false);
    }
  }, []);

  // Fetch shared tag tree from FR-10 backend
  const fetchTagTree = useCallback(async () => {
    try {
      const tree = await tagsService.getTagTree();
      setTagTree(tree || []);
    } catch (err) {
      console.error('Failed to load taxonomy tree:', err);
    }
  }, []);

  // Fetch assignments & annotations for selected paper
  const fetchPaperDetailsAndTags = useCallback(async (paperId) => {
    if (!paperId) {
      setAssignments([]);
      setAnnotations([]);
      return;
    }

    activePaperIdRef.current = paperId;
    setLoadingAssignments(true);
    setAssignmentError(null);
    try {
      const [assignmentsRes, annotationsRes] = await Promise.allSettled([
        paperTagsService.getAssignmentsForPaper(paperId),
        annotationsService.getAnnotations(paperId),
      ]);

      if (activePaperIdRef.current !== paperId) return;

      if (assignmentsRes.status === 'fulfilled') {
        setAssignments(assignmentsRes.value.assignments || []);
      } else {
        throw assignmentsRes.reason;
      }

      if (annotationsRes.status === 'fulfilled') {
        setAnnotations(Array.isArray(annotationsRes.value) ? annotationsRes.value : []);
      }
    } catch (err) {
      if (activePaperIdRef.current === paperId) {
        setAssignmentError(getApiErrorMessage(err, 'Failed to retrieve tag assignments.'));
      }
    } finally {
      if (activePaperIdRef.current === paperId) {
        setLoadingAssignments(false);
      }
    }
  }, []);

  // Initial data load
  useEffect(() => {
    fetchPapers();
    fetchTagTree();
  }, [fetchPapers, fetchTagTree]);

  // Synchronize paper selection with URL parameter
  useEffect(() => {
    if (!papers || papers.length === 0) return;

    if (selectedPaperIdFromUrl) {
      const found = papers.find((p) => p.id === selectedPaperIdFromUrl);
      if (found) {
        setSelectedPaper(found);
      } else {
        papersService
          .getPaperById(selectedPaperIdFromUrl)
          .then((directPaper) => {
            if (directPaper) setSelectedPaper(directPaper);
          })
          .catch((err) => console.warn('Could not load paper by URL id:', err));
      }
    } else {
      const first = papers[0];
      setSelectedPaper(first);
      setSearchParams({ paperId: first.id }, { replace: true });
    }
  }, [selectedPaperIdFromUrl, papers, setSearchParams]);

  // When selected paper ID changes, fetch its assignments and annotations
  useEffect(() => {
    if (selectedPaper?.id) {
      fetchPaperDetailsAndTags(selectedPaper.id);
    }
  }, [selectedPaper?.id, fetchPaperDetailsAndTags]);

  // Filter papers list by search query
  const filteredPapers = useMemo(() => {
    if (!paperSearch.trim()) return papers;
    const q = paperSearch.toLowerCase().trim();
    return papers.filter(
      (p) =>
        p.title?.toLowerCase().includes(q) ||
        p.arxiv_id?.toLowerCase().includes(q) ||
        (Array.isArray(p.authors) ? p.authors.some((a) => a.toLowerCase().includes(q)) : false)
    );
  }, [papers, paperSearch]);

  const handleSelectPaper = (paper) => {
    if (!paper || paper.id === selectedPaper?.id) return;
    setAssignments([]);
    setAnnotations([]);
    setAssignmentError(null);
    setSelectedPaper(paper);
    setSearchParams({ paperId: paper.id }, { replace: true });
  };

  const handleRefreshCurrentPaper = () => {
    if (selectedPaper?.id) {
      fetchPaperDetailsAndTags(selectedPaper.id);
    }
  };

  return (
    <div className="space-y-7 animate-fadeIn text-[#F8FAFC]">
      {/* Page Header */}
      <PageHeader
        title="Paper & Annotation Tagging Workspace (FR-11)"
        description="Categorize research papers and specific page annotations with hierarchical topic tags from the verified scientific taxonomy."
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <Link to="/taxonomy">
              <Button variant="outline" size="sm" iconLeft={FolderTree} className="gap-1.5">
                <span>Manage Taxonomy</span>
                <ExternalLink className="w-3.5 h-3.5 text-violet-400" />
              </Button>
            </Link>

            {selectedPaper && (
              <Link to={`/papers/${selectedPaper.id}?tab=pdf`}>
                <Button variant="secondary" size="sm" iconLeft={BookOpen} className="gap-1.5">
                  <span>Open PDF Reader</span>
                </Button>
              </Link>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchPapers();
                fetchTagTree();
                handleRefreshCurrentPaper();
              }}
              iconLeft={RefreshCw}
              className="p-2"
              title="Refresh workspace"
              aria-label="Refresh workspace"
            />
          </div>
        }
      />

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (4 cols): Paper Selector */}
        <div className="lg:col-span-4 bg-[#1B1D2B] rounded-2xl border border-white/[0.08] p-4 sm:p-5 shadow-sm space-y-4 flex flex-col h-[780px]">
          <div>
            <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.07]">
              <h3 className="text-sm font-bold text-[#F8FAFC] flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-violet-400" />
                <span>Select Publication</span>
              </h3>
              <Badge variant="primary" size="xs">
                {filteredPapers.length} Available
              </Badge>
            </div>
            <p className="text-xs text-[#A1A1B5] mt-1.5">
              Choose a paper from the repository to inspect and assign hierarchical topics
            </p>
          </div>

          {/* Search Papers */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#71758B] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={paperSearch}
              onChange={(e) => setPaperSearch(e.target.value)}
              placeholder="Search by title, author, arXiv ID..."
              className="w-full pl-10 pr-3 py-2 text-xs bg-[#161827] border border-white/10 rounded-xl text-[#F8FAFC] placeholder:text-[#71758B] focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition"
            />
          </div>

          {/* Papers Scroll List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loadingPapers ? (
              <div className="flex flex-col items-center justify-center py-16 text-xs text-[#71758B] space-y-2.5">
                <RefreshCw className="w-5 h-5 animate-spin text-violet-400" />
                <span>Loading research library...</span>
              </div>
            ) : papersError ? (
              <ErrorState
                title="Failed to load papers"
                message={papersError}
                onRetry={fetchPapers}
              />
            ) : filteredPapers.length === 0 ? (
              <div className="text-center py-12 text-xs text-[#71758B] space-y-2.5">
                <BookOpen className="w-8 h-8 text-[#71758B] mx-auto" />
                <p className="font-semibold text-[#F8FAFC]">No papers found</p>
                <p>Upload a new PDF paper from the Explore tab to start tagging.</p>
              </div>
            ) : (
              filteredPapers.map((paper) => {
                const isSelected = selectedPaper?.id === paper.id;
                return (
                  <div
                    key={paper.id}
                    onClick={() => handleSelectPaper(paper)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'border-violet-500 bg-violet-600/15 shadow-sm shadow-violet-950/20 text-[#F8FAFC]'
                        : 'border-white/[0.08] hover:border-white/20 bg-[#161827]/70 text-[#A1A1B5] hover:text-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
                        Paper #{paper.id.slice(0, 8)}
                      </span>
                      {paper.arxiv_id && (
                        <span className="text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                          arXiv:{paper.arxiv_id}
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs sm:text-sm font-bold text-[#F8FAFC] line-clamp-2 leading-snug mb-1.5">
                      {paper.title}
                    </h4>

                    {paper.authors && paper.authors.length > 0 && (
                      <p className="text-[11px] text-[#A1A1B5] truncate flex items-center gap-1.5">
                        <User className="w-3 h-3 shrink-0 text-[#71758B]" />
                        <span>{paper.authors.join(', ')}</span>
                      </p>
                    )}

                    <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-[#71758B]">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-[#71758B]" />
                        <span>{formatDate(paper.uploaded_at, { shortMonth: true })}</span>
                      </span>

                      {isSelected && (
                        <span className="text-violet-400 font-bold flex items-center gap-1">
                          <span>Active</span>
                          <CheckCircle2 className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column (8 cols): Tagging Workspace for Selected Paper */}
        <div className="lg:col-span-8 space-y-6">
          {selectedPaper ? (
            <>
              {/* Active Paper Banner */}
              <div className="p-5 bg-[#1B1D2B] rounded-2xl border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-violet-400">
                      Active Workspace Target
                    </span>
                    {selectedPaper.arxiv_id && (
                      <Badge variant="purple" size="xs">
                        arXiv:{selectedPaper.arxiv_id}
                      </Badge>
                    )}
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-[#F8FAFC] leading-snug">
                    {selectedPaper.title}
                  </h2>
                  <p className="text-xs text-[#A1A1B5] mt-1.5">
                    Authors: <strong className="text-[#F8FAFC]">{selectedPaper.authors?.join(', ') || 'Unknown'}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link to={`/papers/${selectedPaper.id}?tab=pdf`}>
                    <Button variant="secondary" size="sm" iconLeft={BookOpen}>
                      View PDF Reader
                    </Button>
                  </Link>
                </div>
              </div>

              {assignmentError && (
                <div className="p-3 bg-rose-500/15 border border-rose-500/25 rounded-xl flex items-start gap-2 text-xs text-rose-300 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{assignmentError}</span>
                </div>
              )}

              {/* Section 1: Paper-Level Tag Assignments */}
              <PaperTagSection
                paper={selectedPaper}
                assignments={assignments}
                tagTree={tagTree}
                onRefresh={handleRefreshCurrentPaper}
                canAssign={canAssign}
                loading={loadingAssignments}
              />

              {/* Section 2: Annotation-Level Tag Assignments */}
              <AnnotationTagSection
                paper={selectedPaper}
                annotations={annotations}
                assignments={assignments}
                tagTree={tagTree}
                onRefresh={handleRefreshCurrentPaper}
                canAssign={canAssign}
                loading={loadingAssignments}
              />
            </>
          ) : (
            <div className="bg-[#1B1D2B] rounded-2xl border border-dashed border-white/10 p-12 text-center text-xs text-[#71758B] space-y-3">
              <BookOpen className="w-12 h-12 text-[#71758B] mx-auto" />
              <h3 className="text-base font-bold text-[#F8FAFC]">
                No Paper Selected
              </h3>
              <p className="max-w-md mx-auto leading-relaxed">
                Select a paper from the left panel to review existing topic assignments, assign new hierarchical tags, or tag specific page annotations.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
