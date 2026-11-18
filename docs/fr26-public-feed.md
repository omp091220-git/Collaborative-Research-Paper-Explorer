# FR-26: public feed and discovery

This feature builds on FR-25's existing posts and account visibility model. It
adds a public discovery page at `/feed` and public-only post pages at
`/feed/:postId`. The landing page, authenticated sidebar and mobile navigation
link to the feed. Guests can browse without signing in; signed-in users keep the
normal workspace layout.

Users can search titles, content, author names and tags; filter by an exact topic
tag or linked paper; sort newest/oldest; paginate; and refresh. Filters are encoded
in the URL, so reload and browser history work. Loading, no-result, empty-feed,
out-of-range page, invalid request and server-error states have recovery actions.
HTML in post text is displayed as text, not executed or rendered as markup.

## Backend contract

- `GET /api/posts`: public feed/search. Existing FR-25 route, extended rather than
  replaced. Parameters: `q` (up to 200 characters), `tag` (up to 50 characters),
  `paperId` (UUID), `sort=newest|oldest`, `limit=1..100` (default 20),
  `offset=0..1000000` (default 0). The UI uses 12 posts per page.
- `GET /api/posts/public/:id`: public-only detail. Private, deleted and
  private-author posts all return 404 regardless of the viewer's identity.
- Existing protected FR-25 creation/update/delete endpoints remain available.
  The existing hybrid author/detail endpoints retain authorized private access,
  while their public views respect current account privacy and omit account email.

Both the post and its author must currently be PUBLIC. SQL applies those checks
before search, sorting, pagination and counts. There is no owner/admin/permission
exception on public discovery. The same filter covers legacy inconsistent rows,
such as a PUBLIC post whose author switched to a PRIVATE account. Changing
visibility does not delete or rewrite posts. Switching an account back to PUBLIC
never makes explicitly PRIVATE posts public.

Queries use bound parameters; SQL ordering comes from a fixed allow-list. Search
escapes `%`, `_` and backslashes as literal text. Repeated, malformed, out-of-range
or unsupported query parameters return 400. A public DTO excludes account emails,
credentials and private-post permissions. Discovery responses and errors use
`Cache-Control: no-store`. Connection/missing-schema failures return a safe 503.

## Setup

No new migration, Gemini key, Redis connection or production environment setting
is required. FR-25's `database/20261118_account_type_and_posts.sql` must already be
applied to the application's database. Normal Vite development continues to proxy
to port 5000; the optional `API_PROXY_TARGET` override supports isolated tests.

FR-26 is read-only discovery. Writing posts and setting their visibility use the
existing FR-25 APIs; likes/comments/sharing are separate requirements, not dummy
controls on the feed.

## Reproducible verification

Automated tests require a **localhost database whose name contains `test`**.
They reject a shared/remote database URL. Fixtures create a random isolated
schema, seed test-only users/posts, and drop only that schema afterward. No team
Neon data or real secrets are used.

Backend, from `backend`:

```sh
npm ci
# Set TEST_DATABASE_URL to your local test PostgreSQL database.
npm run test:fr26
```

This runs FR-25 regression tests plus FR-26's real PostgreSQL and HTTP tests.
Coverage includes guests, students, owners, private authors, admins, explicit
private-post readers, account/privacy changes, legacy visibility rows, exact
wildcard searching, SQL injection strings, pagination ties, totals, safe errors
and public response fields.

Browser tests, from `frontend`:

```sh
npm ci
npx playwright install chromium
# Set TEST_DATABASE_URL to your local test PostgreSQL database.
npm run test:fr26
```

Alternatively set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chrome/Chromium
binary. The runner starts the real Express app on 127.0.0.1:5056 and the production
Vite build/preview on 127.0.0.1:5176. Test-only setup/token/reset endpoints exist
only in the separate localhost test harness, never the production app.

The browser suite runs in desktop/mobile and light/dark combinations. It checks
real feed/search/detail responses, real FR-25 writes and privacy changes,
pagination/history, loading/error/retry, stale-response cancellation, keyboard
search, narrow layouts/navigation, XSS inertness and form text contrast >= 4.5:1.
Only intentional network-failure/latency scenarios intercept feed requests.
HTML reports, screenshots and failure traces are generated under the ignored
`frontend/playwright-report-fr26` and `frontend/test-results-fr26` directories.

## Baseline caveat

Before FR-26 edits, the isolated base commit `5fbfbb6` ran 939 backend tests:
898 passed and 41 failed. Whole-frontend lint had 4 errors and 55 warnings.
Those pre-existing failures are tracked separately from FR-26 acceptance checks;
a passing feature suite does not mean the whole repository passes. The user's
instruction is to withhold pushing while the overall checks are red unless the
user explicitly approves an exception for unchanged baseline failures.
