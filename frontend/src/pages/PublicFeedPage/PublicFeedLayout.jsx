import { Link, Outlet } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import AppLayout from '../../components/layout/AppLayout';

export default function PublicFeedLayout() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <p role="status" className="p-8 text-slate-700 dark:text-slate-200">
        Loading public feed…
      </p>
    );
  if (user) return <AppLayout />;
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900">
        <nav
          aria-label="Public navigation"
          className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4"
        >
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100"
          >
            <BookOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            ScholarSphere
          </Link>
          <div className="flex gap-5 text-sm font-semibold">
            <Link to="/feed" className="text-indigo-700 dark:text-indigo-300">
              Public feed
            </Link>
            <Link to="/login" className="text-slate-700 dark:text-slate-200">
              Sign in
            </Link>
          </div>
        </nav>
      </header>
      <main className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
