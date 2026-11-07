import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Sparkles,
  MessageSquare,
  Users2,
  GitBranch,
  Edit3,
  Bookmark,
  ExternalLink,
  FileDown,
  Lightbulb,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLibrary } from '../../context/LibraryContext';
import { useToast } from '../../context/ToastContext';
import papersService from '../../services/papers.service';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import PaperMetadata from '../../components/papers/PaperMetadata';
import PaperPdfViewer from '../../components/papers/PaperPdfViewer';
import PaperSummaryModal from '../../components/papers/PaperSummaryModal';
import AnnotationList from '../../components/annotations/AnnotationList';
import AddAnnotationModal from '../../components/annotations/AddAnnotationModal';
import DiscussionPanel from '../../components/DiscussionPanel';
import CollaboratorsModal from '../../components/CollaboratorsModal';
import CitationGraph from '../../components/CitationGraph';
import RecommendedPapersModal from '../../components/RecommendedPapersModal';
import PaperTagSection from '../../components/tagging/PaperTagSection';
import paperTagsService from '../../services/paperTags.service';
import tagsService from '../../services/tags.service';
import ErrorState from '../../components/common/ErrorState';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import { formatDate } from '../../utils/formatters';

export default function PaperDetailsPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAdmin, isResearcher } = useAuth();
  const { isBookmarked, toggleBookmark } = useLibrary();
  const { addToast } = useToast();

  const [paper, setPaper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // FR-11 Paper Tag Assignments & Shared Taxonomy
  const [paperAssignments, setPaperAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [tagTree, setTagTree] = useState([]);

  const fetchPaperAssignments = useCallback(async () => {
    if (!id) return;
    setLoadingAssignments(true);
    try {
      const [assignRes, treeRes] = await Promise.allSettled([
        paperTagsService.getAssignmentsForPaper(id),
        tagsService.getTagTree(),
      ]);
      if (assignRes.status === 'fulfilled') {
        setPaperAssignments(assignRes.value.assignments || []);
      }
      if (treeRes.status === 'fulfilled') {
        setTagTree(treeRes.value || []);
      }
    } catch (err) {
      console.error('Failed to load paper tags:', err);
    } finally {
      setLoadingAssignments(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPaperAssignments();
  }, [fetchPaperAssignments]);

  // Tabs: pdf | overview | annotations | discussions | citations
  const urlTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(urlTab || 'pdf');

  useEffect(() => {
    if (urlTab && urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId }, { replace: true });
  };

  // Modals state
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
  const [recommendationsOpen, setRecommendationsOpen] = useState(false);
  const [citationGraphOpen, setCitationGraphOpen] = useState(false);

  const [annotationRefreshKey, setAnnotationRefreshKey] = useState(0);

  const fetchPaperDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await papersService.getPaperById(id);
      setPaper(data.paper || data);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.message ||
          'Failed to load research paper details.'
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPaperDetails();
  }, [fetchPaperDetails]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto py-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        <div className="h-12 w-3/4 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <LoadingSkeleton count={6} />
          </div>
          <div className="space-y-4">
            <LoadingSkeleton count={4} />
          </div>
        </div>
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <ErrorState
          title="Could not find paper"
          message={error || 'The requested research paper does not exist.'}
          onRetry={fetchPaperDetails}
        />
        <div className="mt-6 text-center">
          <Link to="/explore">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" /> Return to Explore Papers
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const bookmarked = isBookmarked(paper.id);

  const handleToggleBookmark = () => {
    const nextState = toggleBookmark(paper);
    addToast({
      type: nextState ? 'success' : 'info',
      title: nextState ? 'Bookmark Saved' : 'Bookmark Removed',
      message: nextState
        ? `"${paper.title}" added to your research library.`
        : `"${paper.title}" removed from your research library.`,
    });
  };

  const tabs = [
    { id: 'pdf', label: 'PDF Document Viewer', icon: FileText },
    { id: 'overview', label: 'Overview & Abstract', icon: BookOpen },
    { id: 'annotations', label: 'Annotations', icon: Edit3 },
    { id: 'discussions', label: 'Discussions', icon: MessageSquare },
    { id: 'citations', label: 'Citation Graph', icon: GitBranch },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Back navigation & Quick actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={bookmarked ? 'primary' : 'outline'}
            size="sm"
            onClick={handleToggleBookmark}
            className="gap-1.5"
          >
            <Bookmark className={`w-4 h-4 ${bookmarked ? 'fill-current' : ''}`} />
            <span>{bookmarked ? 'Saved' : 'Save'}</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSummaryModalOpen(true)}
            className="gap-1.5 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 text-indigo-700 dark:from-indigo-950/40 dark:to-purple-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
          >
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>AI Summaries</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCollaboratorsOpen(true)}
            className="gap-1.5"
          >
            <Users2 className="w-4 h-4" />
            <span>Collaborators</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setRecommendationsOpen(true)}
            className="gap-1.5"
          >
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <span>Recommendations</span>
          </Button>
        </div>
      </div>

      {/* Paper Header Card */}
      <div className="p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {paper.arxiv_id && (
            <Badge variant="purple" size="sm">
              arXiv:{paper.arxiv_id}
            </Badge>
          )}
          {paper.source_type && (
            <Badge variant="blue" size="sm">
              {paper.source_type}
            </Badge>
          )}
          {paper.publication_date && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Published {formatDate(paper.publication_date)}
            </span>
          )}
        </div>

        <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-snug mb-3">
          {paper.title}
        </h1>

        {paper.authors && (
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-4">
            {typeof paper.authors === 'string'
              ? paper.authors
              : Array.isArray(paper.authors)
              ? paper.authors.join(', ')
              : 'Unknown Authors'}
          </p>
        )}

        {/* Primary external links & action triggers */}
        <div className="flex items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 flex-wrap">
          <button
            type="button"
            onClick={() => handleTabChange('pdf')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs ${
              activeTab === 'pdf'
                ? 'bg-indigo-600 text-white shadow-indigo-500/20 shadow-sm'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Open in PDF Viewer</span>
          </button>

          <a
            href={paper.pdf_url || `/api/papers/${paper.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition"
          >
            <FileDown className="w-4 h-4" />
            <span>Download PDF</span>
          </a>

          {paper.arxiv_id && (
            <a
              href={`https://arxiv.org/abs/${paper.arxiv_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>View on arXiv.org</span>
            </a>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-300 dark:border-slate-800">
        <nav className="flex space-x-6 overflow-x-auto scrollbar-none" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`py-3 px-1 border-b-2 text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 font-bold'
                    : 'border-transparent text-slate-700 hover:text-slate-950 hover:border-slate-400 dark:text-slate-300 dark:hover:text-white font-medium'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="pt-2">
        {/* Tab 0: Interactive PDF Viewer */}
        {activeTab === 'pdf' && (
          <div className="space-y-4">
            <PaperPdfViewer
              paperId={paper.id}
              paper={paper}
              pdfUrl={paper.pdf_url || `/api/papers/${paper.id}/pdf`}
            />
          </div>
        )}
        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Abstract */}
              <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-xs">
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">
                  Abstract
                </h3>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {paper.abstract || 'No abstract is available for this research paper.'}
                </p>
              </div>

              {/* FR-10 & FR-11 Paper-Level Topic Tags */}
              <PaperTagSection
                paper={paper}
                assignments={paperAssignments}
                tagTree={tagTree}
                onRefresh={fetchPaperAssignments}
                canAssign={isAdmin || isResearcher}
                loading={loadingAssignments}
              />

              {/* Sections / Extracted Text if available */}
              {paper.sections && paper.sections.length > 0 && (
                <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Parsed Paper Sections
                  </h3>
                  <div className="space-y-4 divide-y divide-slate-100 dark:divide-slate-800">
                    {paper.sections.map((section, idx) => (
                      <div key={section.id || idx} className="pt-4 first:pt-0">
                        <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200 mb-1">
                          {section.title || `Section ${idx + 1}`}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {section.content || section.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Metadata & BibTeX */}
            <div className="lg:col-span-1">
              <PaperMetadata paper={paper} />
            </div>
          </div>
        )}

        {/* Tab 2: Annotations */}
        {activeTab === 'annotations' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Paper Annotations & Highlights
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Collaborative page comments, highlights, and margin notes
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setAnnotationModalOpen(true)}
                className="gap-1.5"
              >
                <Edit3 className="w-4 h-4" />
                <span>Add Annotation</span>
              </Button>
            </div>

            <AnnotationList
              key={annotationRefreshKey}
              paperId={paper.id}
              canDeleteAll={isAdmin}
            />
          </div>
        )}

        {/* Tab 3: Discussions */}
        {activeTab === 'discussions' && (
          <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Collaborative Discussions
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Open discussion threads, questions, and peer review remarks
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setDiscussionOpen(true)}
                className="gap-1.5"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Open Full Discussion Panel</span>
              </Button>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
              Collaborative research threads allow you and your invited co-authors to discuss specific
              text highlights, figure captions, or general paper findings in real-time.
            </p>

            <Button
              variant="outline"
              size="md"
              onClick={() => setDiscussionOpen(true)}
              className="w-full sm:w-auto"
            >
              Launch Threaded Discussion View →
            </Button>
          </div>
        )}

        {/* Tab 4: Citation Graph */}
        {activeTab === 'citations' && (
          <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Interactive Citation Graph
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Visual node network of forward citations, backward references, and co-citation clusters
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCitationGraphOpen(true)}
                className="gap-1.5"
              >
                <GitBranch className="w-4 h-4" />
                <span>Open Interactive Graph Modal</span>
              </Button>
            </div>

            <div className="h-96 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-6 text-center">
              <GitBranch className="w-12 h-12 text-indigo-500 mb-3 animate-pulse" />
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
                Explore Connected Research Citations
              </h4>
              <p className="text-xs text-slate-500 max-w-md mb-4">
                Analyze seminal works, citation influence clusters, and direct preprint lineage with D3.js visualization.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCitationGraphOpen(true)}
              >
                Launch D3 Citation Graph Viewer
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* AI Perspectives Summary Modal */}
      <PaperSummaryModal
        paper={paper}
        isOpen={summaryModalOpen}
        onClose={() => setSummaryModalOpen(false)}
      />

      {/* Add Annotation Modal */}
      <AddAnnotationModal
        paperId={paper.id}
        isOpen={annotationModalOpen}
        onClose={() => setAnnotationModalOpen(false)}
        onCreated={() => {
          setAnnotationRefreshKey((k) => k + 1);
          setAnnotationModalOpen(false);
          addToast({
            type: 'success',
            title: 'Annotation Added',
            message: 'Your research note has been published.',
          });
        }}
      />

      {/* Collaborators Modal */}
      <CollaboratorsModal
        paper={paper}
        isOpen={collaboratorsOpen}
        onClose={() => setCollaboratorsOpen(false)}
      />

      {/* Discussions Slide-over / Modal */}
      <DiscussionPanel
        paper={paper}
        isOpen={discussionOpen}
        onClose={() => setDiscussionOpen(false)}
      />

      {/* Recommended Papers Modal */}
      {recommendationsOpen && (
        <RecommendedPapersModal
          paper={paper}
          onClose={() => setRecommendationsOpen(false)}
          onRefreshPapers={fetchPaperDetails}
        />
      )}

      {/* Interactive Citation Graph Modal */}
      {citationGraphOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-6xl h-[85vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-indigo-500" />
                <span>Citation Network: {paper.title}</span>
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCitationGraphOpen(false)}
              >
                Close
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              <CitationGraph
                paperId={paper.id}
                initialPaper={paper}
                onClose={() => setCitationGraphOpen(false)}
                onSelectPaper={(selectedId) => {
                  setCitationGraphOpen(false);
                  navigate(`/papers/${selectedId}`);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
