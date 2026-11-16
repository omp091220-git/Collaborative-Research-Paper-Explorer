import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users, GraduationCap, Building2, BookOpen, ChevronRight, Loader2 } from 'lucide-react';
import researcherService from '../../services/researcher.service';

// Role badge styling
const ROLE_STYLES = {
  RESEARCHER: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  STUDENT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  SYSTEM_ADMIN: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

function ResearcherCard({ researcher }) {
  const { id, full_name, role, affiliation, research_interests = [] } = researcher;
  const initials = full_name
    ? full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <Link
      to={`/researchers/${id}`}
      className="group flex flex-col gap-3 p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all"
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {full_name}
          </p>
          {role && (
            <span
              className={`inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                ROLE_STYLES[role] || ROLE_STYLES.STUDENT
              }`}
            >
              {role.replace('_', ' ')}
            </span>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 flex-shrink-0 transition-colors" />
      </div>

      {/* Affiliation */}
      {affiliation && (
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <Building2 className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
          <span className="truncate">{affiliation}</span>
        </div>
      )}

      {/* Research interests */}
      {research_interests.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {research_interests.slice(0, 4).map((interest, i) => (
            <span
              key={i}
              className="text-[11px] font-medium px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full"
            >
              {interest}
            </span>
          ))}
          {research_interests.length > 4 && (
            <span className="text-[11px] font-medium px-2 py-0.5 text-slate-400 dark:text-slate-500">
              +{research_interests.length - 4} more
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded w-1/3" />
        </div>
      </div>
      <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded w-1/2 mb-3" />
      <div className="flex gap-1.5">
        <div className="h-5 w-16 bg-slate-100 dark:bg-slate-800 rounded-full" />
        <div className="h-5 w-20 bg-slate-100 dark:bg-slate-800 rounded-full" />
      </div>
    </div>
  );
}

export default function ResearcherSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const data = await researcherService.searchResearchers(q.trim());
      setResults(data.researchers ?? []);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to search researchers. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search — fires 400ms after user stops typing
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 400);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
          <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Researcher Search</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Find researchers by name and explore their profiles and publications.
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
          {loading ? (
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
          ) : (
            <Search className="w-5 h-5 text-slate-400" />
          )}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search researchers by name…"
          className="w-full pl-12 pr-5 py-3.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 text-slate-900 dark:text-white placeholder-slate-400"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setHasSearched(false); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white font-medium"
          >
            Clear
          </button>
        )}
      </div>

      {/* Hint when empty */}
      {!hasSearched && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400 dark:text-slate-600">
          <GraduationCap className="w-14 h-14 mb-4 opacity-40" />
          <p className="text-sm font-medium">Type at least 2 characters to search</p>
          <p className="text-xs mt-1 opacity-70">Search by researcher's full or partial name</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Results */}
      {!loading && hasSearched && results.length > 0 && (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {results.length} researcher{results.length !== 1 ? 's' : ''} found
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {results.map((r) => (
              <ResearcherCard key={r.id} researcher={r} />
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && hasSearched && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-4" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No researchers found</p>
          <p className="text-xs text-slate-400 mt-1">
            Try a different name or spelling.
          </p>
        </div>
      )}
    </div>
  );
}
