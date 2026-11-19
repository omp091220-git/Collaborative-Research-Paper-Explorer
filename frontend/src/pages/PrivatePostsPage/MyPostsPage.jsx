import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import service from "../../services/privatePosts.service";
import { getApiErrorMessage } from "../../services/api";
import "./PrivatePosts.css";

export default function MyPostsPage() {
  const [params, setParams] = useSearchParams(),
    navigate = useNavigate();
  const rawOffset = params.get("offset") || "0";
  const offset = Number(rawOffset);
  const [result, setResult] = useState(null),
    [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    service
      .list({ offset: rawOffset, limit: "12" }, controller.signal)
      .then((data) => {
        if (active) setResult({ rawOffset, reload, data });
      })
      .catch((e) => {
        if (active)
          setResult({ rawOffset, reload, error: getApiErrorMessage(e) });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [rawOffset, reload]);
  const current =
    result?.rawOffset === rawOffset && result?.reload === reload
      ? result
      : null;
  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const post = await service.create({
        title: data.get("title"),
        content: data.get("content"),
      });
      navigate(`/posts/${post.id}`);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="private-posts max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">My &amp; shared posts</h1>
        <div className="flex flex-wrap gap-2">
          <Link className="post-action" to="/feed">
            Public feed
          </Link>
          <button onClick={() => setReload((n) => n + 1)}>Refresh posts</button>
          <button
            className="post-primary"
            onClick={() => setCreating((v) => !v)}
          >
            New private post
          </button>
        </div>
      </div>
      <p className="text-theme-secondary text-sm">
        Your posts and private posts shared with you. Post access does not grant
        access to linked papers.
      </p>
      {creating && (
        <form
          onSubmit={create}
          className="p-5 rounded-2xl border border-theme-strong bg-theme-card space-y-4"
          aria-label="New private post"
        >
          <h2 className="font-bold">Create a private post</h2>
          <label>
            Post title
            <input name="title" minLength={3} maxLength={255} required />
          </label>
          <label>
            Post content
            <textarea
              name="content"
              minLength={5}
              maxLength={25000}
              rows={5}
              required
            />
          </label>
          {error && (
            <p role="alert" className="text-red-600 dark:text-red-300">
              {error}
            </p>
          )}
          <button disabled={busy} className="post-primary">
            {busy ? "Creating…" : "Create private post"}
          </button>
        </form>
      )}
      {!current && <p role="status">Loading posts…</p>}
      {current?.error && (
        <div role="alert">
          <p>{current.error}</p>
          <button onClick={() => setReload((n) => n + 1)}>Try again</button>
        </div>
      )}
      {current?.data && (
        <>
          <p role="status">{current.data.total} accessible posts</p>
          {!current.data.posts.length && (
            <p>
              No posts on this page. Create a private post or ask its owner to
              share one with you.
            </p>
          )}
          <div className="space-y-3">
            {current.data.posts.map((post) => (
              <article
                key={post.id}
                className="p-5 rounded-2xl bg-theme-card border border-theme-strong"
              >
                <p className="text-xs font-semibold text-theme-secondary">
                  {post.access} · {post.visibility}
                </p>
                <h2 className="text-lg font-bold mt-2">
                  <Link to={`/posts/${post.id}`}>{post.title}</Link>
                </h2>
                <p className="text-sm text-theme-secondary mt-1">
                  {post.author_name}
                </p>
                <Link className="post-action mt-3" to={`/posts/${post.id}`}>
                  Open post
                </Link>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <button
              disabled={!offset}
              onClick={() =>
                setParams({ offset: String(Math.max(0, offset - 12)) })
              }
            >
              Previous page
            </button>
            <button
              disabled={offset + 12 >= current.data.total}
              onClick={() => setParams({ offset: String(offset + 12) })}
            >
              Next page
            </button>
          </div>
        </>
      )}
    </div>
  );
}
