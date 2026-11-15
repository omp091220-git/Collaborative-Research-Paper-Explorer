import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Bookmark,
  FolderKanban,
  Users2,
  Sparkles,
  ArrowRight,
  Compass,
  FilePlus,
  RefreshCw,
  MailCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLibrary } from '../../context/LibraryContext';
import { useToast } from '../../context/ToastContext';
import papersService from '../../services/papers.service';
import collaborationsService from '../../services/collaborations.service';
import PageHeader from '../../components/layout/PageHeader';
import PaperCard from '../../components/papers/PaperCard';
import PaperSummaryModal from '../../components/papers/PaperSummaryModal';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import EmptyState from '../../components/common/EmptyState';
import { LoadingSkeletonGrid } from '../../components/common/LoadingSkeleton';
import ErrorState from '../../components/common/ErrorState';
import { ROLE_LABELS, ROLE_COLORS } from '../../utils/constants';

export default function DashboardPage() {
  const { user, isAdmin, hasPermission } = useAuth();
  const { bookmarks, collections } = useLibrary();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [papers, setPapers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summaryPaper, setSummaryPaper] = useState(null);

  const canUpload = hasPermission('papers:upload') || isAdmin;

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [papersRes, invitationsRes] = await Promise.allSettled([
        papersService.getPapers({ limit: 6 }),
        collaborationsService.getMyInvitations(),
      ]);

      if (papersRes.status === 'fulfilled') {
        setPapers(papersRes.value.papers || papersRes.value || []);
      } else {
        throw new Error('Failed to load recent research papers.');
      }

      if (invitationsRes.status === 'fulfilled') {
        setInvitations(invitationsRes.value.invitations || []);
      }
    } catch (err) {
      setError(err.message || 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();

    // Listen for paper creation events
    const handlePaperCreated = () => loadDashboardData();
    window.addEventListener('paper:created', handlePaperCreated);
    return () => window.removeEventListener('paper:created', handlePaperCreated);
  }, [loadDashboardData]);

  const handleAcceptInvite = async (inviteId) => {
    try {
      await collaborationsService.acceptInvitation(inviteId);
      addToast({
        type: 'success',
        title: 'Invitation Accepted',
        message: 'You have joined the collaborative research paper.',
      });
      loadDashboardData();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Accept Failed',
        message: err.response?.data?.error || 'Could not accept invitation.',
      });
    }
  };

  const handleDeclineInvite = async (inviteId) => {
    try {
      await collaborationsService.declineInvitation(inviteId);
      addToast({
        type: 'info',
        title: 'Invitation Declined',
        message: 'The research invitation has been removed.',
      });
      loadDashboardData();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Decline Failed',
        message: err.response?.data?.error || 'Could not decline invitation.',
      });
    }
  };

  const stats = [
    {
      label: 'Repository Papers',
      value: papers.length,
      icon: BookOpen,
      color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-400',
      link: '/explore',
    },
    {
      label: 'Saved Bookmarks',
      value: bookmarks?.length || 0,
      icon: Bookmark,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400',
      link: '/library',
    },
    {
      label: 'Active Collections',
      value: collections?.length || 0,
      icon: FolderKanban,
      color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/50 dark:text-purple-400',
      link: '/collections',
    },
    {
      label: 'Pending Invites',
      value: invitations.length,
      icon: Users2,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400',
      link: '/collaborations',
    },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <PageHeader
        title={`Welcome back, ${user?.full_name?.split(' ')[0] || 'Scholar'}`}
        description="Monitor scientific literature, collaborate with your lab team, and generate multi-perspective AI summaries."
        badge={
          <Badge variant={ROLE_COLORS[user?.role] || 'indigo'} size="sm">
            {ROLE_LABELS[user?.role] || user?.role}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadDashboardData}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Link to="/explore">
              <Button variant="primary" size="sm" className="gap-1.5">
                <Compass className="w-4 h-4" />
                <span>Explore Papers</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              to={stat.link}
              className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700/50 transition-all hover:shadow-md group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2.5 rounded-xl ${stat.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {stat.value}
              </div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                {stat.label}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Pending Invitations Banner (if any) */}
      {invitations.length > 0 && (
        <div className="p-5 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/30 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold text-sm">
              <MailCheck className="w-5 h-5 text-emerald-600" />
              <span>You have {invitations.length} pending research collaboration invitation(s)</span>
            </div>
            <Link
              to="/collaborations"
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              View all →
            </Link>
          </div>

          <div className="space-y-2 mt-3">
            {invitations.slice(0, 2).map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white/80 dark:bg-slate-900/80 rounded-xl border border-emerald-100 dark:border-emerald-900/40 text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {inv.paper_title || 'Collaborative Paper'}
                  </span>
                  <span className="text-slate-500 ml-2">
                    Invited as <strong className="uppercase">{inv.role}</strong> by {inv.inviter_name || 'Author'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleAcceptInvite(inv.id)}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeclineInvite(inv.id)}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Perspectives Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-900 to-violet-900 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent pointer-events-none" />
        <div className="max-w-2xl relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-indigo-200 mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Multi-Perspective Summaries</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
            Accelerate Your Scientific Comprehension
          </h2>
          <p className="text-sm text-indigo-200 leading-relaxed mb-4">
            Select any research paper to instantly synthesize Layman analogies,
            high-level Executive briefs, or deep architectural breakdowns.
          </p>
          <div className="flex items-center gap-3">
            <Link to="/explore">
              <Button variant="secondary" size="sm" className="bg-white text-indigo-900 hover:bg-indigo-50 font-semibold">
                Explore Repository
              </Button>
            </Link>
            {canUpload && (
              <span className="text-xs text-indigo-300">
                Or upload a PDF from the navigation header
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Recent Papers Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Recently Added Papers
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Latest preprints and literature uploaded to the explorer
            </p>
          </div>
          <Link
            to="/explore"
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <LoadingSkeletonGrid count={3} />
        ) : error ? (
          <ErrorState
            title="Failed to load papers"
            message={error}
            onRetry={loadDashboardData}
          />
        ) : papers.length === 0 ? (
          <EmptyState
            title="No papers in repository yet"
            description="Be the first to upload a research paper or import a preprint directly from ArXiv."
            icon={FilePlus}
            actionLabel={canUpload ? 'Explore Papers' : undefined}
            onAction={canUpload ? () => navigate('/explore') : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {papers.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                onOpenSummary={(p) => setSummaryPaper(p)}
              />
            ))}
          </div>
        )}
      </section>

      {/* AI Summary Modal */}
      <PaperSummaryModal
        paper={summaryPaper}
        isOpen={Boolean(summaryPaper)}
        onClose={() => setSummaryPaper(null)}
      />
    </div>
  );
}
