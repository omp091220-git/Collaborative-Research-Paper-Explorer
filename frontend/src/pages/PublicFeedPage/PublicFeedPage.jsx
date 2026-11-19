import { useEffect, useState } from 'react';
import './PublicFeedPage.css';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Globe,
  Search,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  FileText,
} from 'lucide-react';
import feedService from '../../services/publicFeed.service';
import { getApiErrorMessage } from '../../services/api';
import Button from '../../components/common/Button';
import ErrorState from '../../components/common/ErrorState';

const pageSize = 12;
const date = (value) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(value),
  );
export default function PublicFeedPage() {
  const [params, setParams] = useSearchParams();
  const queryKey = params.toString();
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState(null);
  const q = params.get('q') || '',
    tag = params.get('tag') || '',
    sort = params.get('sort') || 'newest';
  const offset = Number(params.get('offset') || 0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const query = new URLSearchParams(queryKey);
    query.set('limit', String(pageSize));
    feedService
      .list(query, controller.signal)
      .then((data) => {
        if (active) setResult({ key: queryKey, reload, data });
      })
      .catch((error) => {
        if (active)
          setResult({
            key: queryKey,
            reload,
            error: getApiErrorMessage(error, 'Could not load public posts.'),
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [queryKey, reload]);
  const current =
    result?.key === queryKey && result?.reload === reload ? result : null;
  const loading = !current;
  const data = current?.data;
  const submit = (event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget),
      next = new URLSearchParams();
    for (const key of ['q', 'tag']) {
      const value = String(fields.get(key) || '').trim();
      if (value) next.set(key, value);
    }
    if (fields.get('sort') === 'oldest') next.set('sort', 'oldest');
    if (params.get('paperId')) next.set('paperId', params.get('paperId'));
    setParams(next);
  };
  const paginate = (nextOffset) => {
    const next = new URLSearchParams(params);
    if (nextOffset) next.set('offset', String(nextOffset));
    else next.delete('offset');
    setParams(next);
  };
  const hasFilters = Boolean(q || tag || params.get('paperId'));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 text-sm font-semibold">
            <Globe className="w-4 h-4" />
            Research community
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            Public feed
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Discover research ideas and updates shared publicly.
          </p>
        </div>
        <Button
          variant="outline"
          iconLeft={RefreshCw}
          onClick={() => setReload((v) => v + 1)}
          disabled={loading}
          className="min-h-11"
        >
          Refresh feed
        </Button>
      </div>
      <form
        key={queryKey}
        onSubmit={submit}
        aria-label="Search public posts"
        className="public-feed-form grid gap-3 rounded-2xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_170px_auto]"
      >
        <div>
          <label
            htmlFor="post-query"
            className="block mb-1 text-xs font-semibold text-slate-800 dark:text-slate-200"
          >
            Search public posts
          </label>
          <input
            id="post-query"
            name="q"
            type="search"
            maxLength={200}
            defaultValue={q}
            placeholder="Title, content, author, or topic"
            className="w-full min-h-11 rounded-lg border border-slate-400 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <div>
          <label
            htmlFor="post-tag"
            className="block mb-1 text-xs font-semibold text-slate-800 dark:text-slate-200"
          >
            Topic tag
          </label>
          <input
            id="post-tag"
            name="tag"
            maxLength={50}
            defaultValue={tag}
            placeholder="e.g. machine-learning"
            className="w-full min-h-11 rounded-lg border border-slate-400 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <div>
          <label
            htmlFor="post-sort"
            className="block mb-1 text-xs font-semibold text-slate-800 dark:text-slate-200"
          >
            Sort posts
          </label>
          <select
            id="post-sort"
            name="sort"
            defaultValue={sort}
            className="w-full min-h-11 rounded-lg border border-slate-400 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        <Button type="submit" iconLeft={Search} className="min-h-11 self-end">
          Search
        </Button>
      </form>
      {(hasFilters || sort === 'oldest') && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
          <span>
            {hasFilters ? 'Filtered public posts' : 'Oldest posts first'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setParams({})}
            className="min-h-10"
          >
            Clear filters
          </Button>
        </div>
      )}
      {loading && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-slate-300 p-8 text-slate-700 dark:border-slate-700 dark:text-slate-200"
        >
          Loading public posts…
        </div>
      )}
      {current?.error && (
        <ErrorState
          title="Could not load public feed"
          message={current.error}
          onRetry={() => setReload((v) => v + 1)}
        />
      )}
      {data && (
        <>
          <p
            role="status"
            aria-live="polite"
            className="break-words text-sm text-slate-600 dark:text-slate-300"
          >
            {data.total} public {data.total === 1 ? 'post' : 'posts'}
            {q ? ` matching “${q}”` : ''}
          </p>
          {!data.posts.length ? (
            <div className="rounded-2xl border border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
              <Globe className="mx-auto w-9 h-9 text-indigo-600 dark:text-indigo-400" />
              <h2 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">
                {hasFilters
                  ? 'No public posts match your search'
                  : offset
                    ? 'No posts on this page'
                    : 'No public posts yet'}
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {hasFilters
                  ? 'Try different keywords or clear the filters.'
                  : offset
                    ? 'Return to the first page or refresh the feed.'
                    : 'Posts shared publicly will appear here.'}
              </p>
              {offset > 0 && (
                <Button
                  variant="outline"
                  onClick={() => paginate(0)}
                  className="mt-4 min-h-11"
                >
                  First page
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.posts.map((post) => (
                <article
                  key={post.id}
                  className="min-w-0 rounded-2xl border border-slate-300 bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex w-10 h-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200 font-bold"
                    >
                      {post.author_name?.charAt(0) || 'S'}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 break-words">
                        {post.author_name || 'Scholar'}
                      </p>
                      <time
                        dateTime={post.created_at}
                        className="text-xs text-slate-600 dark:text-slate-400"
                      >
                        {date(post.created_at)}
                      </time>
                    </div>
                    <span className="ml-auto text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                      Public
                    </span>
                  </div>
                  <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100 break-words">
                    <Link to={`/feed/${post.id}`} className="hover:underline">
                      {post.title}
                    </Link>
                  </h2>
                  <p className="mt-2 line-clamp-4 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    {post.content}
                  </p>
                  {post.tags?.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {post.tags.map((topic) => (
                        <Link
                          key={topic}
                          to={`/feed?tag=${encodeURIComponent(topic)}`}
                          className="max-w-full break-words rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
                        >
                          #{topic}
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                    {post.paper_id && (
                      <Link
                        to={`/feed?paperId=${post.paper_id}`}
                        className="inline-flex max-w-full gap-1.5 items-start text-xs text-slate-700 dark:text-slate-300"
                      >
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="break-words">
                          {post.paper_title || 'Linked research paper'}
                        </span>
                      </Link>
                    )}
                    <Link
                      to={`/feed/${post.id}`}
                      aria-label={`Read post: ${post.title}`}
                      className="ml-auto inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300"
                    >
                      Read post <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
          {(offset > 0 || offset + data.posts.length < data.total) && (
            <nav
              aria-label="Feed pagination"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <Button
                variant="outline"
                iconLeft={ArrowLeft}
                disabled={offset === 0}
                onClick={() => paginate(Math.max(0, offset - pageSize))}
                className="min-h-11"
              >
                Previous page
              </Button>
              <span className="text-sm text-slate-700 dark:text-slate-200">
                Page {Math.floor(offset / pageSize) + 1}
              </span>
              <Button
                variant="outline"
                iconRight={ArrowRight}
                disabled={offset + data.posts.length >= data.total}
                onClick={() => paginate(offset + pageSize)}
                className="min-h-11"
              >
                Next page
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
