import { useState, useEffect, useCallback, useMemo } from 'react';
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

  // Fetch all papers from FR-6 backend
  const fetchPapers = useCallback(async () => {
    setLoadingPapers(true);
    setPapersError(null);
    try {
      const res = await papersService.getPapers({ limit: 50 });
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

    setLoadingAssignments(true);
    setAssignmentError(null);
    try {
      const [assignmentsRes, annotationsRes] = await Promise.allSettled([
        paperTagsService.getAssignmentsForPaper(paperId),
        annotationsService.getAnnotations(paperId),
      ]);

      if (assignmentsRes.status === 'fulfilled') {
        setAssignments(assignmentsRes.value.assignments || []);
      } else {
        throw assignmentsRes.reason;
      }

      if (annotationsRes.status === 'fulfilled') {
        setAnnotations(annotationsRes.value || []);
      }
    } catch (err) {
      setAssignmentError(getApiErrorMessage(err, 'Failed to fetch paper tag assignments.'));
    } finally {
      setLoadingAssignments(false);
    }
  }, []);

  // Initial loads
  useEffect(() => {
    fetchPapers();
    fetchTagTree();
  }, [fetchPapers, fetchTagTree]);

  // Synchronize selected paper with URL query parameter
  useEffect(() => {
    if (papers.length === 0) return;
    if (selectedPaperIdFromUrl) {
      const found = papers.find((p) => String(p.id) === String(selectedPaperIdFromUrl));
      if (found) {
        if (selectedPaper?.id !== found.id) {
          setSelectedPaper(found);
        }
        return;
      }
    }
    // If no paper selected yet or current selection is not in list, select first
    if (!selectedPaper || !papers.some((p) => p.id === selectedPaper.id)) {
      setSelectedPaper(papers[0]);
    }
  }, [selectedPaperIdFromUrl, papers, selectedPaper]);

  // When selected paper changes, fetch its assignments and annotations and sync URL
  useEffect(() => {
    if (selectedPaper?.id) {
      fetchPaperDetailsAndTags(selectedPaper.id);
      setSearchParams({ paperId: selectedPaper.id }, { replace: true });
    }
  }, [selectedPaper, fetchPaperDetailsAndTags, setSearchParams]);

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
    setSelectedPaper(paper);
    setSearchParams({ paperId: paper.id }, { replace: true });
  };

  const handleRefreshCurrentPaper = () => {
    if (selectedPaper?.id) {
      fetchPaperDetailsAndTags(selectedPaper.id);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <PageHeader
        title="Paper & Annotation Tagging Workspace (FR-11)"
        description="Categorize research papers and specific page annotations with hierarchical topic tags from the verified scientific taxonomy."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/taxonomy">
              <Button variant="outline" size="sm" iconLeft={FolderTree} className="gap-1.5">
                <span>Manage Topic Taxonomy</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </Link>

            {selectedPaper && (
              <Link to={`/papers/${selectedPaper.id}?tab=pdf`}>
                <Button variant="secondary" size="sm" iconLeft={BookOpen} className="gap-1.5">
                  <span>Open in PDF Viewer</span>
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
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 p-4 shadow-xs space-y-4 flex flex-col h-[780px]">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Select Research Paper</span>
              </h3>
              <Badge variant="default" size="xs">
                {filteredPapers.length} Available
              </Badge>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Choose a paper from the repository to inspect and assign hierarchical topics
            </p>
          </div>

          {/* Search Papers */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={paperSearch}
              onChange={(e) => setPaperSearch(e.target.value)}
              placeholder="Search by title, author, arXiv ID..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          {/* Papers Scroll List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loadingPapers ? (
              <div className="flex flex-col items-center justify-center py-16 text-xs text-slate-500 space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                <span>Loading research library...</span>
              </div>
            ) : papersError ? (
              <ErrorState
                title="Failed to load papers"
                message={papersError}
                onRetry={fetchPapers}
              />
            ) : filteredPapers.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500 space-y-2">
                <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">No papers found</p>
                <p>Upload a new PDF paper from the Explore tab to start tagging.</p>
              </div>
            ) : (
              filteredPapers.map((paper) => {
                const isSelected = selectedPaper?.id === paper.id;
                return (
                  <div
                    key={paper.id}
                    onClick={() => handleSelectPaper(paper)}
                    className={`p-3 rounded-xl border transition cursor-pointer select-none ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                        Paper #{paper.id.slice(0, 8)}
                      </span>
                      {paper.arxiv_id && (
                        <span className="text-[10px] font-mono font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 py-0.2 rounded">
                          arXiv:{paper.arxiv_id}
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug mb-1">
                      {paper.title}
                    </h4>

                    {paper.authors && paper.authors.length > 0 && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate flex items-center gap-1">
                        <User className="w-3 h-3 shrink-0 text-slate-400" />
                        <span>{paper.authors.join(', ')}</span>
                      </p>
                    )}

                    <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{formatDate(paper.uploaded_at, { shortMonth: true })}</span>
                      </span>

                      {isSelected && (
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-0.5">
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
              <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                      Active Workspace Target
                    </span>
                    {selectedPaper.arxiv_id && (
                      <Badge variant="purple" size="xs">
                        arXiv:{selectedPaper.arxiv_id}
                      </Badge>
                    )}
                  </div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                    {selectedPaper.title}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Authors: <strong>{selectedPaper.authors?.join(', ') || 'Unknown'}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link to={`/papers/${selectedPaper.id}?tab=pdf`}>
                    <Button variant="outline" size="sm" iconLeft={BookOpen}>
                      View PDF
                    </Button>
                  </Link>
                </div>
              </div>

              {assignmentError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl flex items-start gap-2 text-xs text-rose-800 dark:text-rose-200 font-semibold">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
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
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 p-12 text-center text-xs text-slate-500 space-y-3">
              <BookOpen className="w-12 h-12 text-slate-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                No Paper Selected
              </h3>
              <p className="max-w-md mx-auto">
                Select a paper from the left panel to review existing topic assignments, assign new hierarchical tags, or tag specific page annotations.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
