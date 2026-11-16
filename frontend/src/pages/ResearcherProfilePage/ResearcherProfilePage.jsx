import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  BookOpen,
  ExternalLink,
  Loader2,
  RefreshCw,
  CheckCircle2,
  HelpCircle,
  Globe,
  FileText,
  Users,
} from 'lucide-react';
import researcherService from '../../services/researcher.service';

// Role badge styles
const ROLE_STYLES = {
  RESEARCHER: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  STUDENT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  SYSTEM_ADMIN: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

// Source badge styles
const SOURCE_STYLES = {
  platform: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  arxiv: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  crossref: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  external: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

function SourceBadge({ source }) {
  const label =
    source === 'platform'
      ? 'Platform'
      : source === 'arxiv'
      ? 'arXiv'
      : source === 'crossref'
      ? 'CrossRef'
      : source || 'External';

  return (
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
        SOURCE_STYLES[source] || SOURCE_STYLES.external
      }`}
    >
      {label}
    </span>
  );
}

function PublicationItem({ pub }) {
  const { title, authors = [], publication_year, venue, doi, source_url, source, is_verified, abstract } = pub;
  const [expanded, setExpanded] = useState(false);
  const authorsText = Array.isArray(authors) ? authors.join(', ') : authors;

  return (
    <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
      <div className="flex items-start gap-3">
        {/* Verified indicator */}
        <div className="mt-0.5 flex-shrink-0">
          {is_verified ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" title="Verified publication" />
          ) : (
            <HelpCircle className="w-4 h-4 text-slate-400" title="Unverified / external discovery" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <SourceBadge source={source} />
            {publication_year && (
              <span className="text-[10px] text-slate-400 font-medium">{publication_year}</span>
            )}
          </div>

          <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug mb-1">
            {title || 'Untitled'}
          </p>

          {authorsText && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 truncate">{authorsText}</p>
          )}

          {venue && (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">{venue}</p>
          )}

          {abstract && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded((p) => !p)}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                {expanded ? 'Hide abstract' : 'Show abstract'}
              </button>
              {expanded && (
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-6">
                  {abstract}
                </p>
              )}
            </div>
          )}

          {/* Links */}
          <div className="flex gap-3 mt-2">
            {doi && (
              <a
                href={`https://doi.org/${doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                DOI
              </a>
            )}
            {source_url && source !== 'platform' && (
              <a
                href={source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:underline"
              >
                <Globe className="w-3 h-3" />
                Source
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
      <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-200 dark:bg-slate-700" />
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/4" />
            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/2" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function ResearcherProfilePage() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [discovering, setDiscovering] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    researcherService
      .getResearcherProfile(id)
      .then((data) => {
        setProfile(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.response?.data?.error || 'Failed to load researcher profile.');
        setLoading(false);
      });
  }, [id]);

  const handleDiscover = async () => {
    setDiscovering(true);
    setDiscoverMsg(null);
    try {
      const result = await researcherService.discoverPublications(id);
      const count = result?.discovered ?? result?.saved ?? 0;
      setDiscoverMsg(`Discovery complete — ${count} publication(s) found or updated.`);
      // Refresh profile to show new pubs
      const updated = await researcherService.getResearcherProfile(id);
      setProfile(updated);
    } catch (err) {
      setDiscoverMsg(err?.response?.data?.error || 'Discovery failed. Please try again.');
    } finally {
      setDiscovering(false);
    }
  };

  if (loading) return <ProfileSkeleton />;

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Link
          to="/researchers"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Search
        </Link>
        <div className="p-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const {
    full_name,
    role,
    affiliation,
    research_interests = [],
    publication_counts = {},
    publications = [],
  } = profile;

  const initials = full_name
    ? full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const { platform_count = 0, external_count = 0, verified_external_count = 0 } = publication_counts;
  const totalCount = platform_count + external_count;

  // Filter publications by tab
  const filteredPubs = publications.filter((p) => {
    if (activeTab === 'platform') return p.source === 'platform';
    if (activeTab === 'external') return p.source !== 'platform';
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        to="/researchers"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Search
      </Link>

      {/* Profile card */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{full_name}</h1>
              {role && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                    ROLE_STYLES[role] || ROLE_STYLES.STUDENT
                  }`}
                >
                  {role.replace('_', ' ')}
                </span>
              )}
            </div>
            {affiliation && (
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mt-1">
                <Building2 className="w-4 h-4 flex-shrink-0 text-slate-400" />
                {affiliation}
              </div>
            )}
          </div>
        </div>

        {/* Research interests */}
        {research_interests.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Research Interests
            </p>
            <div className="flex flex-wrap gap-2">
              {research_interests.map((interest, i) => (
                <span
                  key={i}
                  className="text-xs font-medium px-3 py-1 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50 rounded-full"
                >
                  {interest}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{totalCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Total Publications</p>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{platform_count}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Platform Papers</p>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
          <div className="flex items-center justify-center gap-1.5">
            <p className="text-2xl font-bold text-orange-500 dark:text-orange-400">{external_count}</p>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            External ({verified_external_count} verified)
          </p>
        </div>
      </div>

      {/* Publications section */}
      <div>
        {/* Section header + discover button */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Publications</h2>
          </div>
          <button
            onClick={handleDiscover}
            disabled={discovering}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl transition-colors"
          >
            {discovering ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {discovering ? 'Discovering…' : 'Discover Publications'}
          </button>
        </div>

        {/* Discovery message */}
        {discoverMsg && (
          <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs text-indigo-700 dark:text-indigo-300 font-medium">
            {discoverMsg}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl w-fit">
          {[
            { key: 'all', label: `All (${totalCount})`, icon: Users },
            { key: 'platform', label: `Platform (${platform_count})`, icon: FileText },
            { key: 'external', label: `External (${external_count})`, icon: Globe },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === key
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Publication list */}
        {filteredPubs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No publications here yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Click &ldquo;Discover Publications&rdquo; to fetch from arXiv and CrossRef.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPubs.map((pub, i) => (
              <PublicationItem key={pub.id || i} pub={pub} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
