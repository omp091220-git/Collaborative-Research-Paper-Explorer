import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import service from "../../services/privatePosts.service";
import { getApiErrorMessage } from "../../services/api";
import "./PrivatePosts.css";

function PostContent({ post, onReload, onAccessLost }) {
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [grants, setGrants] = useState(null),
    [sharing, setSharing] = useState(false),
    [grantReload, setGrantReload] = useState(0);
  const privatePost =
    post.visibility === "PRIVATE" || post.author_account_type === "PRIVATE";
  useEffect(() => {
    if (!sharing) return;
    const controller = new AbortController();
    let active = true;
    service
      .permissions(post.id, controller.signal)
      .then((data) => {
        if (active) setGrants({ data });
      })
      .catch((e) => {
        if (active) setGrants({ error: getApiErrorMessage(e) });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [post.id, sharing, grantReload]);
  async function action(operation, success) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
      setMessage(success);
      return true;
    } catch (e) {
      if (
        [401, 403, 404].includes(e.response?.status) &&
        e.response?.data?.code !== "POST_RECIPIENT_NOT_FOUND"
      ) {
        onAccessLost(getApiErrorMessage(e));
      } else setError(getApiErrorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      title: data.get("title"),
      content: data.get("content"),
      tags: data
        .get("tags")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    if (await action(() => service.edit(post.id, body), "Post saved.")) {
      setEditing(false);
      onReload();
    }
  }
  async function grant(event) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    if (
      await action(
        () =>
          service.grant(post.id, {
            email: data.get("email"),
            permission_level: data.get("permission"),
          }),
        "Access saved.",
      )
    ) {
      form.reset();
      setGrantReload((n) => n + 1);
    }
  }
  return (
    <>
      <article className="p-5 sm:p-7 rounded-2xl border border-theme-strong bg-theme-card space-y-4">
        <p className="text-sm text-theme-secondary font-semibold">
          {privatePost ? "Private post" : "Public post"} · Your access:{" "}
          {post.access}
        </p>
        <h1 className="text-2xl font-bold">{post.title}</h1>
        <p className="text-sm text-theme-secondary">{post.author_name}</p>
        {editing ? (
          <form onSubmit={save} className="space-y-4" aria-label="Edit post">
            <label>
              Post title
              <input
                name="title"
                defaultValue={post.title}
                required
                minLength={3}
                maxLength={255}
              />
            </label>
            <label>
              Post content
              <textarea
                name="content"
                defaultValue={post.content}
                required
                minLength={5}
                maxLength={25000}
                rows={8}
              />
            </label>
            <label>
              Topic tags, separated by commas
              <input name="tags" defaultValue={post.tags.join(", ")} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="post-primary" disabled={busy}>
                Save changes
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancel editing
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="whitespace-pre-wrap leading-relaxed">
              {post.content}
            </p>
            <p className="text-sm text-theme-secondary">
              {post.tags.map((tag) => `#${tag}`).join(" ")}
            </p>
            {post.can_edit ? (
              <button onClick={() => setEditing(true)}>Edit post</button>
            ) : (
              <p className="text-sm text-theme-secondary">
                Read-only access. Ask the owner for write permission to edit.
              </p>
            )}
          </>
        )}
        {post.paper_id && (
          <p className="text-sm">
            <Link className="underline" to={`/papers/${post.paper_id}`}>
              Open linked paper
            </Link>{" "}
            (paper permissions are checked separately)
          </p>
        )}
        {post.can_manage && privatePost && (
          <button
            onClick={() => {
              setSharing((v) => !v);
              setGrants(null);
            }}
          >
            {sharing ? "Hide sharing" : "Manage access"}
          </button>
        )}
      </article>
      {error && (
        <p role="alert" className="text-red-600 dark:text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-emerald-700 dark:text-emerald-300">
          {message}
        </p>
      )}
      {sharing && (
        <section
          className="p-5 rounded-2xl border border-theme-strong bg-theme-card space-y-4"
          aria-label="Sharing permissions"
        >
          <h2 className="text-xl font-bold">Sharing permissions</h2>
          <p className="text-sm text-theme-secondary">
            Read allows viewing. Write also allows editing the title, content
            and tags. Only the owner or an administrator can manage access or
            delete the post.
          </p>
          <form
            onSubmit={grant}
            className="space-y-3"
            aria-label="Grant post access"
          >
            <label>
              Registered user's email
              <input
                name="email"
                type="email"
                maxLength={254}
                required
                autoComplete="off"
              />
            </label>
            <label>
              Permission
              <select name="permission" defaultValue="READ">
                <option value="READ">Read only</option>
                <option value="WRITE">Read and write</option>
              </select>
            </label>
            <button className="post-primary" disabled={busy}>
              Save access
            </button>
          </form>
          {!grants && <p role="status">Loading sharing permissions…</p>}
          {grants?.error && (
            <div role="alert">
              <p>{grants.error}</p>
              <button onClick={() => setGrantReload((n) => n + 1)}>
                Retry permissions
              </button>
            </div>
          )}
          {grants?.data && (
            <>
              <h3 className="font-bold">People with access</h3>
              {!grants.data.length && <p>No additional users have access.</p>}
              <ul className="space-y-3">
                {grants.data.map((person) => (
                  <li
                    key={person.user_id}
                    className="border-t border-theme-subtle pt-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">{person.full_name}</p>
                      <p className="text-sm text-theme-secondary">
                        {person.email}
                      </p>
                      <p className="text-sm">
                        {person.permission_level === "WRITE"
                          ? "Read and write"
                          : "Read only"}
                      </p>
                    </div>
                    <button
                      disabled={busy}
                      aria-label={`Remove access for ${person.email}`}
                      onClick={async () => {
                        if (
                          await action(
                            () => service.revoke(post.id, person.user_id),
                            "Access removed.",
                          )
                        )
                          setGrantReload((n) => n + 1);
                      }}
                    >
                      Remove access
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  );
}
export default function PrivatePostPage() {
  const { postId } = useParams();
  const [result, setResult] = useState(null),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    service
      .detail(postId, controller.signal)
      .then((post) => {
        if (active) setResult({ id: postId, reload, post });
      })
      .catch((e) => {
        if (active)
          setResult({ id: postId, reload, error: getApiErrorMessage(e) });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [postId, reload]);
  const current =
    result?.id === postId && result?.reload === reload ? result : null;
  return (
    <div className="private-posts max-w-3xl mx-auto space-y-5">
      <div className="flex flex-wrap gap-2">
        <Link className="post-action" to="/posts">
          My &amp; shared posts
        </Link>
        <button onClick={() => setReload((n) => n + 1)}>Refresh post</button>
      </div>
      {!current && <p role="status">Loading post…</p>}
      {current?.error && (
        <div role="alert">
          <h1 className="text-xl font-bold">Post unavailable</h1>
          <p>{current.error}</p>
          <button onClick={() => setReload((n) => n + 1)}>Try again</button>
        </div>
      )}
      {current?.post && (
        <PostContent
          key={`${postId}-${reload}`}
          post={current.post}
          onReload={() => setReload((n) => n + 1)}
          onAccessLost={(error) => setResult({ id: postId, reload, error })}
        />
      )}
    </div>
  );
}
