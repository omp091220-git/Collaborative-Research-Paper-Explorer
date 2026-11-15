import { Link } from 'react-router-dom';
import {
  BookOpen,
  Sparkles,
  Users2,
  Search,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Layers,
  GitBranch,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';

export default function LandingPage() {
  const { user } = useAuth();

  const features = [
    {
      icon: Sparkles,
      title: 'AI Multi-Perspective Summaries',
      description:
        'Transform complex academic papers into Layman, Executive, or Deep Technical summaries powered by Google Gemini.',
      color: 'from-amber-500 to-orange-500',
    },
    {
      icon: Users2,
      title: 'Real-time Research Collaboration',
      description:
        'Invite co-authors and lab colleagues with granular roles (Viewer, Commenter, Editor, Owner) and threaded discussions.',
      color: 'from-indigo-500 to-blue-500',
    },
    {
      icon: GitBranch,
      title: 'Citation Graphs & Topic Taxonomies',
      description:
        'Explore citation networks and structured hierarchical tag trees to discover interconnected research breakthroughs.',
      color: 'from-emerald-500 to-teal-500',
    },
    {
      icon: Search,
      title: 'ArXiv Direct Sync & PDF Parsing',
      description:
        'Import preprints instantly by ArXiv ID or upload multi-megabyte research PDFs with automatic text section extraction.',
      color: 'from-purple-500 to-pink-500',
    },
  ];

  const metrics = [
    { label: 'Supported Papers', value: 'Unlimited' },
    { label: 'Role-Based Access', value: '3 Tiers' },
    { label: 'Summary Perspectives', value: '3 Levels' },
    { label: 'Session Security', value: '30m Inactivity' },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="font-extrabold text-lg tracking-tight text-white">
              Scholar<span className="text-indigo-400">Sphere</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <Link to="/dashboard">
                <Button variant="primary" size="sm">
                  Go to Dashboard <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white">
                    Sign In
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="primary" size="sm">
                    Get Started <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden pt-20 pb-28 md:pt-28 md:pb-36">
          {/* Background Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-indigo-500/20 via-purple-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-950/60 border border-indigo-700/50 text-indigo-300 text-xs font-semibold mb-8 animate-fadeIn">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Next-Generation Research Collaboration Platform</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-tight sm:leading-none mb-6">
              Read, Analyze & Collaborate on{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">
                Research Papers Faster
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed">
              Explore scientific literature with AI-generated multi-perspective summaries,
              synchronized inline annotations, ArXiv preprints, and real-time lab collaboration.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to={user ? '/dashboard' : '/register'}>
                <Button variant="primary" size="lg" className="w-full sm:w-auto shadow-xl shadow-indigo-600/30">
                  {user ? 'Open Workspace' : 'Start Researching Free'}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link to="/explore">
                <Button variant="secondary" size="lg" className="w-full sm:w-auto border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700">
                  <Search className="w-4 h-4 mr-2" /> Explore Sample Papers
                </Button>
              </Link>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-16 pt-12 border-t border-slate-800/80">
              {metrics.map((m) => (
                <div key={m.label} className="p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-2xl font-bold text-white mb-1">{m.value}</div>
                  <div className="text-xs text-slate-400">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature Cards Grid */}
        <section className="py-20 bg-slate-950/60 border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <Badge variant="indigo" size="md">Core Capabilities</Badge>
              <h2 className="text-3xl font-bold text-white mt-3">
                Built for Students, Academics & Lab Directors
              </h2>
              <p className="text-slate-400 mt-2 text-sm">
                Everything you need to digest literature, track citations, and conduct peer review collaboratively.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="p-8 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all hover:shadow-xl hover:shadow-indigo-500/5 group"
                  >
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${f.color} flex items-center justify-center text-white mb-6 shadow-md group-hover:scale-105 transition-transform`}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">{f.title}</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">{f.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Summary Showcase Section */}
        <section className="py-20 bg-slate-900">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-900/40">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                <div>
                  <Badge variant="indigo">Perspective Engine</Badge>
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-3 mb-4">
                    Three Lenses on Every Breakthrough
                  </h3>
                  <div className="space-y-3 text-slate-300 text-sm">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                      <span><strong>Layman Summary:</strong> Plain language analogies for newcomers & interdisciplinary readers.</span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                      <span><strong>Executive Brief:</strong> High-level methodology, outcomes, and business impact for decision-makers.</span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-pink-400 shrink-0 mt-0.5" />
                      <span><strong>Deep Technical Analysis:</strong> Rigorous architectural dissection, mathematical models, and edge cases.</span>
                    </div>
                  </div>
                </div>

                <div className="w-full md:w-80 shrink-0 p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Cpu className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-slate-200">Gemini 2.5 Flash Engine</span>
                  </div>
                  <div className="text-[12px] text-slate-400 font-mono bg-slate-950 p-3 rounded-lg border border-slate-800">
                    &quot;Attention Is All You Need&quot;<br />
                    <span className="text-indigo-400">Target:</span> Technical<br />
                    <span className="text-emerald-400">Tokens:</span> 842 parsed<br />
                    <span className="text-amber-400">Cached:</span> true (Redis)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>ScholarSphere Collaborative Research Paper Explorer</span>
          </div>
          <div className="flex items-center gap-6">
            <span>Built with React 19 & Tailwind CSS</span>
            <div className="flex items-center gap-1.5 text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>RBAC Protected</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
