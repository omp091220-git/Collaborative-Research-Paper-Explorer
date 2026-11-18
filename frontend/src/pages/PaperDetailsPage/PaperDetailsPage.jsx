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
  Lock,
  KeyRound,
  User,
  Users,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePaperPermissions } from '../../hooks/usePaperPermissions';
import { useLibrary } from '../../context/LibraryContext';
import { useToast } from '../../context/ToastContext';
import papersService from '../../services/papers.service';
import accessRequestsService from '../../services/accessRequests.service';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import PaperMetadata from '../../components/papers/PaperMetadata';
import PaperPdfViewer from '../../components/papers/PaperPdfViewer';
import PaperSummaryModal from '../../components/papers/PaperSummaryModal';
import PaperExportModal from '../../components/papers/PaperExportModal';
import PaperVisibilityToggle from '../../components/papers/PaperVisibilityToggle';
import PermissionRequestModal from '../../components/papers/PermissionRequestModal';
import { getAccessRequestState } from '../../utils/permissionHelpers';
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
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { formatDate } from '../../utils/formatters';

export default function PaperDetailsPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAdmin, isResearcher, isStudent } = useAuth();
  const { isBookmarked, toggleBookmark } = useLibrary();
  const { addToast } = useToast();

  const [paper, setPaper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingRequest, setPendingRequest] = useState(null);

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

  // Tabs: overview | pdf | annotations | discussions | citations
  // Default to 'overview' so Paper Details & Request Access are prominent
  const urlTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(urlTab || 'overview');

  // Synchronize tab state with URL query parameter
  useEffect(() => {
    if (urlTab && urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
  }, [urlTab, activeTab]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId }, { replace: true });
  };

  // Modals state
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
  const [recommendationsOpen, setRecommendationsOpen] = useState(false);
  const [citationGraphOpen, setCitationGraphOpen] = useState(false);
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [isRestrictedPrivate, setIsRestrictedPrivate] = useState(false);

  const [annotationRefreshKey, setAnnotationRefreshKey] = useState(0);

  // Reset route-specific states when switching between papers
  useEffect(() => {
    setPaper(null);
    setPaperAssignments([]);
    setError(null);
    setPendingRequest(null);
    setIsRestrictedPrivate(false);
    setPermissionModalOpen(false);
    setSummaryModalOpen(false);
    setExportModalOpen(false);
    setAnnotationModalOpen(false);
    setDiscussionOpen(false);
    setCollaboratorsOpen(false);
    setRecommendationsOpen(false);
    setCitationGraphOpen(false);
    setAnnotationRefreshKey(0);
  }, [id]);

  const fetchPaperDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsRestrictedPrivate(false);
    try {
      const data = await papersService.getPaperById(id);
      const paperData = data.paper || data;
      setPaper(paperData);
      // Capture pending_request included by the backend in the paper response
      setPendingRequest(paperData.pending_request || null);
    } catch (err) {
      if (err.response?.status === 403 || err.response?.data?.is_private) {
        setIsRestrictedPrivate(true);
        // Backend now includes pending_request in the 403 response body too
        setPendingRequest(err.response?.data?.pending_request || null);
      }
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

  // Derive paper-level permissions for current user (handles paper === null gracefully)
  const perms = usePaperPermissions(paper);

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

  // Dedicated Private Paper Restricted Screen
  if (isRestrictedPrivate) {
    const gateAccessState = getAccessRequestState({
      paper: { id, visibility: 'PRIVATE' },
      user,
      isRestrictedPrivate: true,
      pendingRequest,
    });

    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center animate-in fade-in duration-200">
        <div className="p-8 bg-theme-card border border-theme-subtle rounded-3xl shadow-xl space-y-4">
          <div className="w-16 h-16 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-theme-main">
            Private Research Paper
          </h2>
          <p className="text-xs text-theme-muted leading-relaxed">
            This research paper is private. Only the paper owner, system administrators, and explicitly
            approved collaborators can view this document, its PDF pages, annotations, and discussions.
          </p>

          <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3">
            {gateAccessState.isPending ? (
              <span className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/15 text-amber-400 font-bold text-xs border border-amber-500/30">
                <Clock className="w-4 h-4" />
                Pending {gateAccessState.pendingPermission} Approval
              </span>
            ) : gateAccessState.canRequest ? (
              <button
                type="button"
                onClick={() => setPermissionModalOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs transition shadow-md shadow-violet-600/25 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>Request Access (VIEW)</span>
              </button>
            ) : null}
            <Link to="/explore">
              <button
                type="button"
                className="px-4 py-2.5 rounded-xl border border-theme-subtle bg-theme-elevated hover:bg-theme-subtle text-theme-secondary text-xs font-semibold transition cursor-pointer"
              >
                Return to Explore Papers
              </button>
            </Link>
          </div>
        </div>

        {permissionModalOpen && (
          <PermissionRequestModal
            paper={{ id, title: 'Private Research Paper', visibility: 'PRIVATE' }}
            isOpen={permissionModalOpen}
            onClose={() => setPermissionModalOpen(false)}
            defaultPermission="VIEW"
            eligiblePermissions={gateAccessState.eligiblePermissions}
            pendingRequest={pendingRequest}
            onSuccess={(grantedPerm) => {
              setPermissionModalOpen(false);
              setPendingRequest({ status: 'PENDING', requested_permission: grantedPerm });
              addToast({
                type: 'success',
                message: 'Your access request has been sent to the paper owner.',
              });
            }}
          />
        )}
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

  // Compute access request eligibility for the current user on this paper
  const accessState = getAccessRequestState({ paper, user, isRestrictedPrivate: false, pendingRequest });

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
    { id: 'overview', label: 'Overview & Abstract', icon: BookOpen },
    { id: 'pdf', label: 'PDF Document Viewer', icon: FileText },
    { id: 'annotations', label: 'Annotations', icon: Edit3 },
    { id: 'discussions', label: 'Discussions', icon: MessageSquare },
    { id: 'citations', label: 'Citation Graph', icon: GitBranch },
  ];

  // Dedicated Full-Screen Research Workspace when on the PDF tab
  if (activeTab === 'pdf') {
    return (
      <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-950">
        <PaperPdfViewer
          paperId={paper.id}
          paper={paper}
          pdfUrl={paper.pdf_url || `/papers/${paper.id}/pdf`}
          className="h-full w-full rounded-none border-none"
          onOpenDetails={() => handleTabChange('overview')}
          onOpenDiscussions={() => handleTabChange('discussions')}
          onOpenSummaries={() => setSummaryModalOpen(true)}
          onOpenCollaborators={() => setCollaboratorsOpen(true)}
          isBookmarked={bookmarked}
          onToggleBookmark={handleToggleBookmark}
        />

        {/* Global Modals accessible from workspace */}
        {summaryModalOpen && (
          <PaperSummaryModal
            isOpen={summaryModalOpen}
            onClose={() => setSummaryModalOpen(false)}
            paperId={paper.id}
            paperTitle={paper.title}
          />
        )}

        {collaboratorsOpen && (
          <CollaboratorsModal
            isOpen={collaboratorsOpen}
            onClose={() => setCollaboratorsOpen(false)}
            paperId={paper.id}
          />
        )}
      </div>
    );
  }

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

          {!isStudent && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCollaboratorsOpen(true)}
              className="gap-1.5"
            >
              <Users2 className="w-4 h-4" />
              <span>Collaborators</span>
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)} iconLeft={FileDown} className="h-9 min-w-24 px-4 whitespace-nowrap">
            Export
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
      <div className="p-6 sm:p-8 bg-theme-card rounded-3xl border border-theme-subtle shadow-sm text-theme-main">
        {/* Ownership & Visibility Header Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-theme-elevated rounded-2xl border border-theme-subtle mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 text-violet-400 flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-theme-main">
                  Owner: {paper.owner_name || 'Dr. Shyam Ramani'}
                </span>
                {paper.is_owner && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded-md border border-purple-500/30">
                    You
                  </span>
                )}
              </div>
              <p className="text-[11px] text-theme-muted">
                {paper.owner_email ? `${paper.owner_email} ` : ''}
                {paper.owner_affiliation ? `• ${paper.owner_affiliation} ` : ''}
                • Uploaded {formatDate(paper.uploaded_at || paper.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isStudent && (
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <BookOpen className="w-3 h-3" />
                Read-only Access
              </span>
            )}

            {!isStudent && (
              <PaperVisibilityToggle
                paperId={paper.id}
                initialVisibility={paper.visibility || 'PUBLIC'}
                canManage={paper.permissions?.canManage}
                onVisibilityChange={(v) => setPaper((prev) => ({ ...prev, visibility: v }))}
              />
            )}

            {isStudent ? (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-theme-card border border-theme-subtle text-theme-secondary">
                <Users className="w-3.5 h-3.5 text-theme-muted" />
                <span>{paper.collaborator_count || 0} Collaborators</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCollaboratorsOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-theme-card border border-theme-subtle text-theme-secondary hover:text-theme-main hover:border-violet-500/40 transition cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-theme-muted" />
                <span>{paper.collaborator_count || 0} Collaborators</span>
              </button>
            )}

            {/* Current permission badge for non-owners */}
            {!accessState.isOwner && accessState.badgeLabel && (
              <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-500/15 text-slate-300 rounded-full border border-slate-500/30">
                {accessState.badgeLabel}
              </span>
            )}

            {/* Pending request indicator */}
            {accessState.isPending && (
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <Clock className="w-3 h-3" />
                Pending {accessState.pendingPermission} Approval
              </span>
            )}

            {/* Request Access button — shown when canRequest and no pending */}
            {accessState.canRequest && !accessState.isPending && (
              <button
                type="button"
                onClick={() => setPermissionModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-xs transition cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{accessState.buttonLabel}</span>
              </button>
            )}
          </div>
        </div>

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
            <span className="text-xs text-theme-secondary">
              Published {formatDate(paper.publication_date)}
            </span>
          )}
        </div>

        <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-theme-main tracking-tight leading-snug mb-3">
          {paper.title}
        </h1>

        {paper.authors && (
          <p className="text-sm font-medium text-theme-secondary mb-4">
            {typeof paper.authors === 'string'
              ? paper.authors
              : Array.isArray(paper.authors)
              ? paper.authors.join(', ')
              : 'Unknown Authors'}
          </p>
        )}

        {/* Primary external links & action triggers */}
        <div className="flex items-center gap-3 pt-4 border-t border-theme-subtle flex-wrap">
          <button
            type="button"
            onClick={() => handleTabChange('pdf')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm ${
              activeTab === 'pdf'
                ? 'bg-violet-600 text-white shadow-violet-600/30'
                : 'bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/30'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Open in PDF Viewer</span>
          </button>

          <a
            href={paper.pdf_url || `/api/papers/${paper.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-theme-elevated hover:bg-theme-elevated text-theme-main border border-white/10 transition"
          >
            <FileDown className="w-4 h-4" />
            <span>Download PDF</span>
          </a>

          {paper.arxiv_id && (
            <a
              href={`https://arxiv.org/abs/${paper.arxiv_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-theme-secondary hover:text-theme-main transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              <span>View on arXiv.org</span>
            </a>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-theme-subtle">
        <nav className="flex space-x-6 overflow-x-auto scrollbar-none" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`py-3.5 px-1 border-b-2 text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
                  isActive
                    ? 'border-violet-500 text-violet-400 font-bold'
                    : 'border-transparent text-theme-muted hover:text-theme-main font-medium'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-violet-400' : 'text-theme-muted'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="pt-2">
        <ErrorBoundary title="Paper Details Tab Error">
        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Abstract */}
              <div className="p-6 bg-theme-card rounded-2xl border border-theme-subtle shadow-xs">
                <h3 className="text-base font-bold text-theme-main mb-3">
                  Abstract
                </h3>
                <p className="text-sm text-theme-secondary leading-relaxed whitespace-pre-line break-words">
                  {paper.abstract || 'No abstract is available for this research paper.'}
                </p>
              </div>

              {/* FR-10 & FR-11 Paper-Level Topic Tags */}
              <PaperTagSection
                paper={paper}
                assignments={paperAssignments}
                tagTree={tagTree}
                onRefresh={fetchPaperAssignments}
                canAssign={!isStudent && (isAdmin || isResearcher)}
                loading={loadingAssignments}
              />

              {/* Sections / Extracted Text if available */}
              {paper.sections && paper.sections.length > 0 && (
                <div className="p-6 bg-theme-card rounded-2xl border border-theme-subtle shadow-xs space-y-4">
                  <h3 className="text-base font-bold text-theme-main">
                    Parsed Paper Sections
                  </h3>
                  <div className="space-y-4 divide-y divide-[var(--border-subtle)]">
                    {paper.sections.map((section, idx) => (
                      <div key={section.id || idx} className="pt-4 first:pt-0">
                        <h4 className="font-semibold text-sm text-theme-main mb-1">
                          {section.title || `Section ${idx + 1}`}
                        </h4>
                        <p className="text-xs text-theme-secondary leading-relaxed">
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
                <h3 className="text-base font-bold text-theme-main">
                  Paper Annotations & Highlights
                </h3>
                <p className="text-xs text-theme-muted">
                  Collaborative page comments, highlights, and margin notes
                </p>
              </div>
              {!isStudent && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setAnnotationModalOpen(true)}
                  className="gap-1.5"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Add Annotation</span>
                </Button>
              )}
            </div>

            <AnnotationList
              key={annotationRefreshKey}
              paperId={paper.id}
              paperOwnerId={paper.uploader_id}
              canDeleteAll={isAdmin}
              isReadOnly={isStudent}
            />
          </div>
        )}

        {/* Tab 3: Discussions */}
        {activeTab === 'discussions' && (
          <div className="p-6 bg-theme-card rounded-2xl border border-theme-subtle shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-theme-main">
                  Collaborative Discussions
                </h3>
                <p className="text-xs text-theme-muted">
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

            <p className="text-sm text-theme-secondary leading-relaxed mb-4">
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
          <div className="p-6 bg-theme-card rounded-2xl border border-theme-subtle shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-theme-main">
                  Interactive Citation Graph
                </h3>
                <p className="text-xs text-theme-muted">
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

            <div className="h-96 rounded-2xl bg-theme-elevated border border-theme-subtle flex flex-col items-center justify-center p-6 text-center">
              <GitBranch className="w-12 h-12 text-violet-400 mb-3 animate-pulse" />
              <h4 className="text-base font-bold text-theme-main mb-1">
                Explore Connected Research Citations
              </h4>
              <p className="text-xs text-theme-muted max-w-md mb-4">
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
        </ErrorBoundary>
      </div>

      <PaperExportModal key={paper.id} paper={paper} isOpen={exportModalOpen} onClose={() => setExportModalOpen(false)} />

      {/* AI Perspectives Summary Modal */}
      <PaperSummaryModal
        paper={paper}
        isOpen={summaryModalOpen}
        onClose={() => setSummaryModalOpen(false)}
      />

      {/* Add Annotation Modal (Never mounted for students) */}
      {!isStudent && annotationModalOpen && (
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
      )}

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
      {/* Permission Request Modal */}
      {permissionModalOpen && (
        <PermissionRequestModal
          paper={paper}
          isOpen={permissionModalOpen}
          onClose={() => setPermissionModalOpen(false)}
          defaultPermission={accessState.targetPermission || 'ANNOTATE'}
          eligiblePermissions={accessState.eligiblePermissions}
          pendingRequest={pendingRequest}
          onSuccess={(grantedPerm) => {
            setPermissionModalOpen(false);
            setPendingRequest({ status: 'PENDING', requested_permission: grantedPerm });
            addToast({
              type: 'success',
              title: 'Request Sent',
              message: 'Your access request has been delivered to the paper owner.',
            });
          }}
        />
      )}
    </div>
  );
}
