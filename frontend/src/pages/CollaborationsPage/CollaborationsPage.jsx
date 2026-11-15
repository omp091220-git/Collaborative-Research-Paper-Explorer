import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Users2, MailCheck, Shield, BookOpen, RefreshCw } from 'lucide-react';
import collaborationsService from '../../services/collaborations.service';
import papersService from '../../services/papers.service';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';

export default function CollaborationsPage() {
  const { addToast } = useToast();
  const [invitations, setInvitations] = useState([]);
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCollaborationsData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invRes, papersRes] = await Promise.allSettled([
        collaborationsService.getMyInvitations(),
        papersService.getPapers({ limit: 8 }),
      ]);

      if (invRes.status === 'fulfilled') {
        setInvitations(invRes.value.invitations || []);
      }
      if (papersRes.status === 'fulfilled') {
        setPapers(papersRes.value.papers || papersRes.value || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch collaboration details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollaborationsData();
  }, [fetchCollaborationsData]);

  const handleAccept = async (id) => {
    try {
      await collaborationsService.acceptInvitation(id);
      addToast({
        type: 'success',
        title: 'Invitation Accepted',
        message: 'You have joined the research collaboration team.',
      });
      fetchCollaborationsData();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Acceptance Failed',
        message: err.response?.data?.error || 'Could not accept invitation.',
      });
    }
  };

  const handleDecline = async (id) => {
    try {
      await collaborationsService.declineInvitation(id);
      addToast({
        type: 'info',
        title: 'Invitation Declined',
        message: 'The research invitation was dismissed.',
      });
      fetchCollaborationsData();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Decline Failed',
        message: err.response?.data?.error || 'Could not decline invitation.',
      });
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Page Header */}
      <PageHeader
        title="Collaborations & Invitations"
        description="Review co-authorship invitations, peer review requests, and joint paper workspaces."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCollaborationsData}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        }
      />

      {/* Invitations Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <MailCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Pending Collaboration Invitations
          </h2>
          <Badge variant={invitations.length > 0 ? 'success' : 'default'} size="sm">
            {invitations.length}
          </Badge>
        </div>

        {loading ? (
          <LoadingSkeleton count={3} />
        ) : error ? (
          <ErrorState
            title="Failed to load invitations"
            message={error}
            onRetry={fetchCollaborationsData}
          />
        ) : invitations.length === 0 ? (
          <EmptyState
            title="No pending invitations"
            description="When colleagues invite you to collaborate on research papers, you'll see requests here."
            icon={Users2}
          />
        ) : (
          <div className="space-y-3">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">
                    {inv.paper_title || 'Collaborative Research Paper'}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span>Invited by <strong className="text-slate-800 dark:text-slate-200">{inv.inviter_name || inv.inviter_email}</strong></span>
                    <span>•</span>
                    <span>Role: <strong className="uppercase text-indigo-700 dark:text-indigo-400 font-bold">{inv.role}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleAccept(inv.id)}
                  >
                    Accept Invitation
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDecline(inv.id)}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Collaboration Permissions Guide */}
      <section className="p-6 bg-slate-50 dark:bg-slate-900/60 rounded-3xl border border-slate-300 dark:border-slate-700 space-y-4">
        <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
          <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Understanding Collaboration Roles</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700">
            <span className="font-bold text-indigo-700 dark:text-indigo-400 uppercase">Owner</span>
            <p className="text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
              Full control over the paper, invite management, permission delegation, and deletion.
            </p>
          </div>
          <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700">
            <span className="font-bold text-emerald-700 dark:text-emerald-400 uppercase">Editor</span>
            <p className="text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
              Can create, edit, and organize annotations, participate in discussions, and update metadata.
            </p>
          </div>
          <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700">
            <span className="font-bold text-amber-700 dark:text-amber-400 uppercase">Commenter</span>
            <p className="text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
              Can post discussion threads, reply to peer comments, and submit page annotations.
            </p>
          </div>
          <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700">
            <span className="font-bold text-slate-700 dark:text-slate-300 uppercase">Viewer</span>
            <p className="text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
              Read-only access to view the paper PDF, inspect annotations, and generate AI perspectives.
            </p>
          </div>
        </div>
      </section>

      {/* Available Papers for Collaboration */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Workspace Papers Available for Collaboration
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Click on any paper to open the Collaborators panel and invite researchers by institutional email.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {papers.slice(0, 6).map((paper) => (
            <Link
              key={paper.id}
              to={`/papers/${paper.id}`}
              className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all hover:shadow-xs group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-1.5 text-xs text-indigo-700 dark:text-indigo-400 font-semibold mb-1">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Paper #{paper.id}</span>
                </div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {paper.title}
                </h4>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-semibold">
                <span>Manage Collaborators →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
