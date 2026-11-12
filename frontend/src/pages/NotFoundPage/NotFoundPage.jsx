import { Link } from 'react-router-dom';
import { BookOpen, Compass } from 'lucide-react';
import Button from '../../components/common/Button';

export default function NotFoundPage() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 animate-fadeIn">
      <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-6 shadow-xs">
        <BookOpen className="w-8 h-8" />
      </div>

      <span className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-2">
        404 — Page Not Found
      </span>

      <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
        Lost in the Scientific Literature?
      </h1>

      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-8 leading-relaxed">
        The research paper, collection, or workspace view you were looking for could not be found. It may have been moved, renamed, or deleted.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link to="/dashboard">
          <Button variant="primary" size="md">
            Go to Dashboard
          </Button>
        </Link>
        <Link to="/explore">
          <Button variant="outline" size="md">
            <Compass className="w-4 h-4 mr-2" /> Explore Papers
          </Button>
        </Link>
      </div>
    </div>
  );
}
