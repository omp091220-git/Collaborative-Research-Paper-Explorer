import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, BookOpen, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import papersService from '../../services/papers.service';
import PageHeader from '../../components/layout/PageHeader';
import DiscussionPanel from '../../components/DiscussionPanel';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import EmptyState from '../../components/common/EmptyState';
import { LoadingSkeletonGrid } from '../../components/common/LoadingSkeleton';

export default function DiscussionsPage() {
  const { isStudent } = useAuth();
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPaper, setSelectedPaper] = useState(null);

  const fetchPapers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await papersService.getPapers({ limit: 12 });
      setPapers(res.papers || res.data || []);
    } catch {
      // Graceful error fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers]);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Page Header */}
      <PageHeader
        title="Discussions & Peer Feedback"
        description="Engage in peer review, ask questions about specific paper sections, and resolve open research threads."
      />

      {/* Intro info box */}
      <div className="p-5 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 rounded-2xl border border-violet-500/20 flex items-start gap-4">
        <div className="p-2.5 rounded-xl bg-violet-600 text-white shrink-0 mt-0.5 shadow-md shadow-violet-600/30">
          <MessageSquare className="w-5 h-5" />
        </div>
        <div className="text-xs sm:text-sm text-theme-secondary">
          <p className="font-semibold text-theme-main mb-1 flex items-center gap-2 flex-wrap">
            <span>Contextual Discussions Tied to Text and Figures</span>
            {isStudent && (
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Read-only Access (Student)
              </span>
            )}
          </p>
          <p className="leading-relaxed">
            {isStudent
              ? 'Browse open discussion threads, peer review remarks, and section-specific notes posted by researchers on available papers.'
              : 'Discussions in ScholarSphere are tied directly to paper highlights, page numbers, or figure captions. Select any research paper below to launch its full threaded conversation panel.'}
          </p>
        </div>
      </div>

      {/* Papers Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-theme-main flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-violet-400" />
            <span>Select a Paper to Open Discussions</span>
          </h2>
          <Badge variant="violet" size="sm">
            {papers.length} Papers Available
          </Badge>
        </div>

        {loading ? (
          <LoadingSkeletonGrid count={6} />
        ) : papers.length === 0 ? (
          <EmptyState
            title="No papers available"
            description="Upload or import a paper to begin collaborative discussions."
            icon={MessageSquare}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {papers.map((paper) => (
              <div
                key={paper.id}
                className="p-5 bg-theme-card rounded-2xl border border-theme-subtle hover:border-violet-500/50 shadow-xs hover:shadow-xl transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-400">
                      Paper #{paper.id}
                    </span>
                    {paper.arxiv_id && (
                      <Badge variant="cyan" size="sm">
                        arXiv:{paper.arxiv_id}
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-bold text-base text-theme-main line-clamp-2 mb-2">
                    {paper.title}
                  </h3>
                  <p className="text-xs text-theme-muted line-clamp-2">
                    {paper.abstract || 'No abstract preview available.'}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-theme-subtle flex items-center justify-between">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setSelectedPaper(paper)}
                    className="gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Discussions</span>
                  </Button>

                  <Link
                    to={`/papers/${paper.id}`}
                    className="text-xs font-semibold text-theme-secondary hover:text-violet-400 inline-flex items-center gap-1"
                  >
                    <span>Details</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Discussion Panel Component */}
      <DiscussionPanel
        paper={selectedPaper}
        isOpen={Boolean(selectedPaper)}
        onClose={() => setSelectedPaper(null)}
      />
    </div>
  );
}
