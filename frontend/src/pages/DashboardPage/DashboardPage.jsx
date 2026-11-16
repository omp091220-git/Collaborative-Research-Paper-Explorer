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
  TrendingUp,
  Clock,
  Layers,
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
      color: 'text-violet-400 bg-violet-500/15 border-violet-500/25',
      link: '/explore',
    },
    {
      label: 'Saved Bookmarks',
      value: bookmarks?.length || 0,
      icon: Bookmark,
      color: 'text-amber-400 bg-amber-500/15 border-amber-500/25',
      link: '/library',
    },
    {
      label: 'Active Collections',
      value: collections?.length || 0,
      icon: FolderKanban,
      color: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/25',
      link: '/collections',
    },
    {
      label: 'Pending Invites',
      value: invitations.length,
      icon: Users2,
      color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25',
      link: '/collaborations',
    },
  ];

  return (
    <div className="space-y-8 animate-fadeIn text-[#F8FAFC]">
      {/* Personalized Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-400">
              Welcome back
            </span>
            <Badge variant={ROLE_COLORS[user?.role] || 'primary'} size="xs">
              {ROLE_LABELS[user?.role] || user?.role || 'SCHOLAR'}
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F8FAFC]">
            {user?.full_name ? `Dr. ${user.full_name}` : 'Research Explorer'}
          </h1>
          <p className="text-xs sm:text-sm text-[#A1A1B5] mt-1 font-normal">
            Collaborative analysis, hierarchical taxonomy, and multi-perspective AI syntheses.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link to="/explore">
            <Button variant="secondary" size="sm" iconLeft={Compass}>
              Explore Papers
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboardData}
            disabled={loading}
            iconLeft={RefreshCw}
            className={`p-2 ${loading ? 'animate-spin' : ''}`}
            title="Refresh dashboard"
            aria-label="Refresh dashboard"
          />
        </div>
      </div>

      {/* Pending Invitations Banner (if any) */}
      {invitations.length > 0 && (
        <div className="p-5 bg-gradient-to-r from-emerald-950/40 via-[#1B1D2B] to-emerald-950/30 rounded-2xl border border-emerald-500/30 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-emerald-300">
              <MailCheck className="w-4 h-4 text-emerald-400" />
              <span>Pending Collaboration Invitations ({invitations.length})</span>
            </div>
            <Link
              to="/collaborations"
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:underline"
            >
              View all
            </Link>
          </div>

          <div className="space-y-2">
            {invitations.slice(0, 3).map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#161827] rounded-xl border border-white/[0.08] text-xs"
              >
                <div>
                  <span className="font-bold text-[#F8FAFC]">
                    {inv.paper_title || 'Collaborative Paper'}
                  </span>
                  <span className="text-[#A1A1B5] ml-2">
                    Invited as <strong className="uppercase text-violet-300">{inv.role}</strong> by {inv.inviter_name || 'Author'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="xs"
                    onClick={() => handleAcceptInvite(inv.id)}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
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

      {/* Stats KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} to={item.link}>
              <div className="p-5 sm:p-6 bg-[#1B1D2B] rounded-2xl border border-white/[0.08] shadow-sm hover:border-violet-500/40 hover:bg-[#1E2132] hover:-translate-y-0.5 transition-all duration-200 group flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#A1A1B5] group-hover:text-[#F8FAFC] transition-colors">
                    {item.label}
                  </p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC] mt-1.5 tracking-tight">
                    {item.value}
                  </p>
                </div>
                <div className={`p-3 rounded-2xl border ${item.color}`}>
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* AI Perspectives Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-violet-950/70 via-[#1B1D2B] to-indigo-950/60 border border-violet-500/30 text-[#F8FAFC] shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-violet-500/15 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-2xl relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/30 text-xs font-bold text-violet-300 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>AI Multi-Perspective Summaries</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight mb-2.5 text-[#F8FAFC]">
            Accelerate Your Scientific Comprehension
          </h2>
          <p className="text-xs sm:text-sm text-[#A1A1B5] leading-relaxed mb-5 font-normal">
            Synthesize Layman analogies, executive summaries, or deep architectural breakdowns for any paper in seconds.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Link to="/explore">
              <Button variant="primary" size="sm" iconRight={ArrowRight}>
                Explore Repository
              </Button>
            </Link>
            <Link to="/taxonomy">
              <Button variant="secondary" size="sm" iconLeft={Layers}>
                Taxonomy Explorer
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Papers Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-[#F8FAFC] tracking-tight">
              Recently Added Literature
            </h2>
            <p className="text-xs text-[#A1A1B5] mt-0.5">
              Latest preprints and publications uploaded to ScholarSphere
            </p>
          </div>
          <Link
            to="/explore"
            className="text-xs font-bold text-violet-400 hover:text-violet-300 inline-flex items-center gap-1 group"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
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
