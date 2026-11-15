import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, BookOpen, ArrowRight } from 'lucide-react';
import papersService from '../../services/papers.service';
import PageHeader from '../../components/layout/PageHeader';
import DiscussionPanel from '../../components/DiscussionPanel';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import EmptyState from '../../components/common/EmptyState';
import { LoadingSkeletonGrid } from '../../components/common/LoadingSkeleton';

export default function DiscussionsPage() {
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
      <div className="p-5 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 flex items-start gap-4">
        <div className="p-2.5 rounded-xl bg-indigo-600 text-white shrink-0 mt-0.5">
          <MessageSquare className="w-5 h-5" />
        </div>
        <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
          <p className="font-semibold text-slate-900 dark:text-white mb-1">
            Contextual Discussions Tied to Text and Figures
          </p>
          <p className="leading-relaxed">
            Discussions in ScholarSphere are tied directly to paper highlights, page numbers, or figure captions.
            Select any research paper below to launch its full threaded conversation panel.
          </p>
        </div>
      </div>

      {/* Papers Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            <span>Select a Paper to Open Discussions</span>
          </h2>
          <Badge variant="indigo" size="sm">
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
                className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700/60 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      Paper #{paper.id}
                    </span>
                    {paper.arxiv_id && (
                      <Badge variant="purple" size="sm">
                        arXiv:{paper.arxiv_id}
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white line-clamp-2 mb-2">
                    {paper.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                    {paper.abstract || 'No abstract preview available.'}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
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
                    className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 inline-flex items-center gap-1"
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
