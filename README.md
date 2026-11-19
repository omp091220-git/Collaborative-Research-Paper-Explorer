# Collaborative Research Paper Explorer

A collaborative research workspace built with React, Express and PostgreSQL. Users can discover and read papers, organize research notes, generate source-linked summaries, export saved research, and control access to papers and social posts.

This README describes the implementation present on this branch, including FR-26 public discovery and FR-30 private-post permissions. A feature being documented here does not mean every requirement or repository-wide test is complete.

## Contents

- [Implemented features](#implemented-features)
- [Roles and access](#roles-and-access)
- [Technology and project structure](#technology-and-project-structure)
- [Local setup](#local-setup)
- [Environment configuration](#environment-configuration)
- [Running the application](#running-the-application)
- [API overview](#api-overview)
- [Automated tests](#automated-tests)
- [Recent validation](#recent-validation)
- [Git workflow](#git-workflow)
- [Troubleshooting](#troubleshooting)

## Implemented features

| Area | Current behavior |
|---|---|
| Accounts and authentication (FR-01–FR-05) | Registration, email verification, login/logout, password reset, optional institutional Google OIDC, profile settings, JWT cookies or bearer tokens, session invalidation and inactivity tracking. |
| Paper library and metadata (FR-06–FR-07) | PDF upload, arXiv import, paper metadata, browsing, bookmarks/stars and personal collections. |
| Structured summaries (FR-08) | Comprehensive, brief/executive, technical and plain-English perspectives. Each contains Background, Methodology, Results and Limitations, with references to original PDF passages. Jobs, saved results and caches persist in PostgreSQL. |
| Figure/table extraction (FR-09) | Background PDF extraction with a worker supervisor, extraction status and stored paper assets. |
| Research tagging (FR-10–FR-13) | Hierarchical topic taxonomy, paper/section/passage tag assignments, duplicate detection, consolidation and hierarchical search. |
| Recommendations (FR-14) | Recommendations for a paper or selected section text/tags through the existing recommendation service. |
| Reader and citation graph (FR-15–FR-16) | Split-pane paper reading, Markdown/LaTeX research notes, annotations and an interactive graph of recorded references/citations. |
| Paper collaboration (FR-17–FR-19) | Contextual discussion threads, replies, collaborator invitations and permissions, notifications and notification streaming. |
| Research exports (FR-20) | Markdown, BibTeX and annotated PDF downloads containing saved summaries, annotations, section tags, citations and source coordinates. PDF exports preserve the original pages and append a readable research report; research notes and bibliography are also embedded. Exporting does not call AI. |
| Administration (FR-21) | Storage/quota status, storage forecasting, optional Redis diagnostics, GenAI usage/cost reporting, system diagnostics and audit-report downloads. Values depend on available configuration and telemetry. |
| Tag suggestions (FR-22–FR-24 workflow) | Generate/review tag proposals, accept or reject suggestions, privacy-scoped tag handling and duplicate checks before acceptance. The review UI is integrated into paper tagging. |
| Account/post visibility (FR-25) | Public accounts may create public or private posts. Private accounts may create only private posts; the backend enforces the restriction. |
| Public feed (FR-26) | `/feed` is available to guests and signed-in users, with text search, topic/paper filters, sorting, pagination and public post detail. Private posts and posts belonging to private accounts are excluded from public discovery. |
| Private-post permissions (FR-30) | `/posts` lists your posts and private posts shared with you. Create private posts, grant registered users READ or WRITE access, change access and revoke it. Writers can edit title, content and tags; only owners/admins control sharing, visibility and deletion. Direct API requests enforce the same rules. |
| Messaging (FR-31–FR-34) | Direct conversations, messaging groups, membership/join rules and group messages, with participant/member checks. |
| Summary PDF endpoint (FR-35–FR-36) | A separate endpoint exports the latest legacy `paper_summaries` record, with an explicitly marked abstract fallback when available and errors when no usable content exists. For combined structured perspectives, use the FR-20 research export. |
| Researcher discovery (FR-37–FR-39) | Researcher name search, public profile information, stored publication lists, and external publication discovery through arXiv and Crossref. Name-based results and counts can be incomplete or ambiguous; they are not a verified worldwide publication total. |

Recent integration also adds paper ownership/visibility, access requests and approval/revocation, a student reading experience, light/dark themes, and fixes for PDF worker loading, PostgreSQL summary connection recovery and provider retry handling.

Post likes, post comments and post-sharing features (FR-27–FR-29) should not be inferred from the public feed alone. Paper stars/discussions are separate features. Check the relevant routes and merged feature branches before treating additional requirements as implemented.

### Summary and export behavior

- Set `GEMINI_API_KEY` to generate new structured summaries. The default model is `gemini-3.5-flash-lite`; `GEMINI_SUMMARY_MODEL` overrides `GEMINI_MODEL`.
- Current extraction limits are 150 pages, 500,000 extracted text characters and 50,000 source passages. The serialized source-evidence limit is 1,500,000 characters. These are application limits, not a guarantee that a provider will accept every document.
- Retryable provider failures use bounded retries/backoff. A provider outage or rate limit can still prevent generation; previously saved summaries remain available.
- Research exports include the saved perspectives available when the export is requested, including a successfully saved technical summary alongside other saved summaries. They cannot include a generation that failed or is still pending.
- Markdown/BibTeX exports do not require a Gemini key or an original PDF. Annotated PDF export requires the original PDF; use a PDF reader with comments/attachments support for embedded material.

## Roles and access

| Role | Main responsibilities |
|---|---|
| `SYSTEM_ADMIN` | Platform monitoring, administration and moderation. Protected operations check authorization on the server. |
| `RESEARCHER` | Upload/import papers and manage research content where ownership/collaborator permissions allow it. |
| `STUDENT` | Read accessible papers and research content, use permitted summaries/exports and personal collections. Paper annotations/discussions remain read-only for students even when paper collaboration records contain a higher permission. |

Paper visibility, paper collaboration, account visibility and social-post permissions are separate controls:

- Private papers require ownership, administrator access or an active paper grant. Access requests support review by the owner.
- Post READ permission permits viewing; WRITE also permits title/content/tag edits. Writers cannot publish the post, reassign its author or linked paper, manage grants or delete it.
- Owners and current system administrators can manage private-post grants. Permission changes and collaborator edits serialize on the post; queued edits recheck access after revocation.
- Sharing a social post does **not** grant permission to its linked research paper.
- Public-feed endpoints remain public-only even for owners, collaborators and administrators.

## Technology and project structure

- **Runtime:** Node.js 22.13+; Node.js 24 is a suitable development choice. The earlier Node 18 setup instructions do not cover the current dependencies.
- **Frontend:** React 19, Vite, React Router, Tailwind CSS, PDF.js/react-pdf and D3.
- **Backend:** Express 5 with ES modules, `pg`, JWT, bcryptjs, Nodemailer and PDF generation/extraction libraries.
- **Storage:** PostgreSQL 15+ and local PDF uploads. Redis is optional monitoring infrastructure; the structured-summary queue is persisted in PostgreSQL.
- **Tests:** Node test runner/Supertest for backend tests and Playwright/Chromium for browser tests.

```text
backend/
  src/
    config/             # Environment and database configuration
    controllers/        # HTTP handling
    middleware/         # Authentication, authorization and paper access
    repositories/       # Database access
    routes/             # Mounted API routes
    scripts/migrate.js  # Registered migration runner
    services/           # Feature logic and external integrations
    test/               # Backend tests
    testSupport/        # Isolated database fixtures
    workers/            # PDF extraction and summary processing
frontend/
  src/                  # Pages, components, context and API clients
  e2e/                  # Browser acceptance tests
  playwright.*.config.js
  vite.config.js
database/               # Schema and registered SQL migrations
scripts/                # Local browser-test harness
uploads/                # Local paper files; uploaded PDFs are ignored by Git
README.md
```

The former `docs/` directory has been removed. Setup and feature guidance is maintained here. The browser-test harness in `scripts/` is used only for local tests and is not mounted by the production server.

## Local setup

Run commands one line at a time. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`; `cd /d` and `&&` are not supported by older PowerShell versions.

1. Clone the group repository, or use your existing fork checkout:

   ```text
   git clone https://github.com/omp091220-git/Collaborative-Research-Paper-Explorer.git
   cd Collaborative-Research-Paper-Explorer
   ```

2. Start PostgreSQL and create a development database, for example:

   ```text
   psql -U postgres -h localhost -c "CREATE DATABASE research_explorer;"
   ```

3. From the project root, create `backend/.env` **only if it does not already exist**:

   PowerShell:

   ```powershell
   if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
   ```

   Bash:

   ```bash
   test -f backend/.env || cp backend/.env.example backend/.env
   ```

4. Edit `backend/.env` with your own development database URL and JWT secret. Install backend dependencies and apply registered migrations:

   ```text
   cd backend
   npm ci
   npm run migrate
   ```

   The runner loads `schema.sql` and registered files from root `database/`, records completed files in `schema_migrations`, and skips recorded migrations on later runs. Importing only `schema.sql` is insufficient for the current features. Do not use the older `backend/migrations/` copies as the migration source.

5. In a second terminal, install frontend dependencies:

   ```text
   cd frontend
   npm ci
   ```

For an existing database, confirm the intended `DATABASE_URL` and retain a backup before applying migrations. If a migration fails, investigate the named file/error before starting the application; do not delete existing tables to bypass it.

## Environment configuration

Use [backend/.env.example](backend/.env.example) as the configuration template. Keep real values in local `backend/.env`, which is ignored by Git. Do not replace placeholders in a committed example with passwords, API keys or JWT secrets.

| Setting | Purpose |
|---|---|
| `DATABASE_URL` | Development/application PostgreSQL connection string. |
| `JWT_SECRET` | Required random signing secret, at least 32 characters. |
| `PORT`, `FRONTEND_URL`, `BACKEND_URL` | Defaults: `5000`, `http://localhost:5173`, `http://localhost:5000`. |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated institutional registration domains. |
| `EMAIL_SERVICE_MODE` | `console` for local development; `smtp` for configured delivery; `disabled` disables delivery. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email delivery configuration. |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `OIDC_ISSUER`, `OIDC_SCOPES` | Optional institutional Google/OIDC login. |
| `GEMINI_API_KEY` | Required for new Gemini structured summaries. Never place it in a frontend variable. |
| `GEMINI_SUMMARY_MODEL` | Summary model override; defaults to `gemini-3.5-flash-lite`. `GEMINI_MODEL` is the fallback configuration name. |
| `SESSION_INACTIVITY_TIMEOUT_MS`, `SESSION_MAX_AGE_MS` | Defaults: 30-minute inactivity timeout and 8-hour session lifetime. |
| Login/password-recovery rate-limit settings | See the template for configurable windows and attempt limits. |
| `STORAGE_QUOTA_MB`, storage warning/critical thresholds | Administrator storage monitoring and alerts. |
| `REDIS_URL` | Optional Redis monitoring connection. |
| `EXPOSE_DEV_RESET_TOKEN` | Development-only helper; keep disabled in production. |
| `TEST_DATABASE_URL` | Separate disposable local PostgreSQL database for tests. Never use the application/team database. |
| `API_PROXY_TARGET` | Optional frontend process setting; defaults to `http://localhost:5000`. Browser-test configs use their own local API server. |

Generate a local JWT secret from the backend terminal, then save the output in your local `.env`:

```text
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Changing the signing secret invalidates tokens issued with the previous secret. Restart the backend after changing its environment settings; existing shell variables can override values loaded from `.env`.

## Running the application

Start both processes in separate terminals, each from the indicated directory:

| Directory | Command | Address |
|---|---|---|
| `backend` | `npm run dev` | `http://localhost:5000` (`/health` for a health check) |
| `frontend` | `npm run dev` | `http://localhost:5173` |

`npm start` in `backend` runs the server without nodemon. The backend starts its extraction supervisor and summary worker; PostgreSQL must be reachable.

Useful frontend routes:

- `/feed`: public discovery and search, including guest access.
- `/feed/:postId`: public-only post detail.
- `/posts`: signed-in **My & shared posts**, private-post creation and shared access.
- `/posts/:postId`: read/edit a permitted post and manage access when authorized.
- `/explore`, `/library`, `/papers/:id`: paper discovery, saved library and reader.
- `/my-papers`, `/access-requests`: paper ownership and access-request workflows, subject to role restrictions.
- `/tagging`, `/taxonomy`: research tagging and hierarchical topics.
- `/researchers`: researcher discovery.
- `/discussions`, `/collaborations`: communication and collaboration.
- `/admin/monitoring`: administrator-only monitoring.

## API overview

Paths below include the `/api` prefix. Protected routes need a valid authenticated cookie or bearer token and any applicable paper/post/role permissions. This table is an overview; route files define payloads and additional operations.

| Area | Representative endpoints |
|---|---|
| Authentication | `/api/auth/register`, `/login`, `/logout`, `/me`, `/verify-email`, `/forgot-password`, `/reset-password`, `/sso/config`, `/sso/login`, `/sso/callback` under the same auth prefix. |
| Papers | `GET /api/papers`; `POST /api/papers/upload`; `POST /api/papers/import`; `GET /api/papers/:id`. |
| Paper access | `/api/papers/:paperId/collaborators`; `/api/access-requests`; `/api/access-requests/my`; `/api/access-requests/received`; request approval/rejection/cancellation routes. |
| Structured summaries | `GET`/`POST /api/papers/:paperId/summaries`; perspective names: `comprehensive`, `brief`, `technical`, `layperson`. |
| Research export | `GET /api/papers/:paperId/export?format=markdown`, `bibtex` or `pdf`. |
| Legacy summary PDF | `GET /api/papers/:id/export/summary-pdf`. |
| PDF assets | `/api/papers/:paperId/assets`, `/extraction-status`, `/extract` under the same paper prefix. |
| Notes, tags and citations | `/api/annotations`, `/api/tags`, `/api/paper-tags`, `/api/papers/:id/citation-graph`. |
| Tag suggestions | `GET /api/papers/:paperId/tag-suggestions`; `POST /api/papers/:paperId/tag-suggestions/generate`; `POST /api/papers/tag-suggestions/:id/accept` or `/reject`. |
| Recommendations | `POST /api/recommendations/section`; `GET /api/recommendations/papers/:id`. |
| Post visibility | `POST /api/posts`; `GET`/`PATCH /api/users/me/account-type`. |
| Public discovery | `GET /api/posts?q=&tag=&paperId=&sort=newest&limit=20&offset=0`; `GET /api/posts/public/:id`. These endpoints exclude private posts regardless of the viewer. |
| Accessible posts | `GET /api/posts/workspace`; `GET`/`PATCH /api/posts/workspace/:id`. Legacy `GET`/`PATCH /api/posts/:id` also enforce post access. |
| Private-post grants | `GET`/`PUT /api/posts/:id/permissions`; `DELETE /api/posts/:id/permissions/:userId`. Grant payload: `{"email":"registered@example.edu","permission_level":"READ"}` or `WRITE`. |
| Direct messages | `/api/direct-messages/users`, `/conversations`, `/conversations/:conversationId/messages` under the same prefix. |
| Groups | `/api/groups`, `/:id/join`, `/:id/leave`, `/:id/messages` and membership review under the group prefix. |
| Researcher profiles | `GET /api/researchers/search?q=`; `GET /api/researchers/:id/profile`; `GET /api/researchers/:id/publications`; `POST /api/researchers/:id/publications/discover`. |
| Notifications | `/api/notifications`, `/unread-count`, `/stream` and read-state updates under the notification prefix. |
| Monitoring | `/api/admin/monitoring/overview`, `/storage`, `/storage/forecast`, `/redis`, `/genai`, `/diagnostics/system`, `/reports/audit-export` under the monitoring prefix. |

## Automated tests

Tests can create, modify and delete fixture data. Use a **separate local disposable database** with `test` in its name. The FR-26/FR-30 fixtures explicitly reject non-local database URLs. Do not use a shared Neon URL or your application database.

Create a test database once, then set the test environment in every terminal running tests:

```text
psql -U postgres -h localhost -c "CREATE DATABASE collaborative_research_test;"
```

PowerShell:

```powershell
$env:TEST_DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/collaborative_research_test"
$env:DATABASE_URL=$env:TEST_DATABASE_URL
```

Bash:

```bash
export TEST_DATABASE_URL='postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/collaborative_research_test'
export DATABASE_URL="$TEST_DATABASE_URL"
```

Use the actual local database password in place of `YOUR_PASSWORD`; URL-encode reserved characters. Configure a test JWT secret of at least 32 characters. With the test database selected, run registered migrations from `backend` before the broad integration suite:

```text
npm run migrate
```

Backend commands, run from `backend`:

| Command | Coverage |
|---|---|
| `npm test` | Entire backend suite; see the baseline limitations below. |
| `npm run test:fr08` | Structured summaries and related worker/database behavior. |
| `npm run test:fr20` | Research exports, PDF content and export database snapshots. |
| `npm run test:fr26` | FR-25 visibility regressions and real-database public-feed/API checks. |
| `npm run test:fr30` | Private-post permissions plus FR-25 and FR-26 backend/API regressions. |

Frontend commands, run from `frontend` in a terminal with the same local `TEST_DATABASE_URL`:

```text
npx playwright install chromium
npm run test:fr30
npm run test:fr26
npm run lint
npm run build
```

The browser configurations build the actual frontend, start an isolated local API on `127.0.0.1:5056`, serve the frontend on `127.0.0.1:5176`, and test desktop/mobile in light/dark themes. Keep those ports free. Tests create and clean up their own random database schemas; the harness has no production fixture/token endpoints. A running application frontend is not required.

If using an already installed Chromium executable, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path. Reports and failure screenshots/traces are written to ignored `frontend/playwright-report-fr26`, `playwright-report-fr30`, `test-results-fr26` and `test-results-fr30` directories.

## Recent validation

Recorded on **19 November 2026** for FR-30 application code at `0550ef7`, with unchanged application code after the `AGENTS.md` deletion at `9c265ec`. These are recorded results, not GitHub Actions checks or a promise that all future checkouts will pass.

| Check | Result |
|---|---|
| Backend/API focused suite (`test:fr30`) | 52 passed, 0 failed, 0 cancelled. |
| FR-30 browser suite | 52 scenarios passed. |
| FR-26 browser regressions | 48 scenarios passed. |
| Production frontend build | Passed. |
| Frontend lint | 0 errors; 62 existing warnings, matching the baseline. |
| Full backend baseline at `140250e` | 1,035 tests: 897 passed, 92 failed, 46 cancelled. |
| Full backend after FR-30 | 1,055 tests: 917 passed, 92 failed, 46 cancelled. Failure records matched the baseline; no new backend failures. |

The full backend suite is **not fully passing** in that recorded environment. Existing failures include fixture/migration/schema mismatches and unrelated feature tests; they remain separate follow-up work. AI/provider availability, SMTP delivery and external bibliographic completeness are not established by the local permission/browser suites.

## Git workflow

The group repository and your fork have separate branches. Work on a feature branch, then review the actual file diff before opening a PR.

```text
git fetch origin
git switch main
git pull --ff-only
git switch -c your-feature-branch
```

If `origin` is your fork, syncing or updating your fork's `main` must happen before creating the branch when you need the latest group code. Updating `main` later does not automatically update an existing feature branch.

After implementing and testing, stage only intended files, commit, and push the feature branch:

```text
git add path/to/changed-file
git commit -m "Describe the concrete change"
git push -u origin your-feature-branch
```

For a fork PR, select **base repository: group repository**, **base branch: `main`**, **head repository: your fork**, and **compare: your feature branch**. If both branches are in the group repository, use its feature branch as the compare branch instead. Creating a PR does not merge it.

PR descriptions should explain behavior, migrations/configuration changes, testing and known limitations. Resolve conflicts by preserving compatible changes from both sides and rerun affected checks. GitHub's “no conflicts” indicator only describes mergeability; it is not a test result. Ahead/behind counts compare commit histories against that repository's default branch and can differ between a fork and the group repository.

## Troubleshooting

| Symptom | Check/action |
|---|---|
| `.env` or `dotenv/config` not found | Run backend commands from `backend`, where its dependencies and `.env` are located. Preserve an existing `.env` rather than overwriting it. |
| `npm.ps1` execution-policy error | Use `npm.cmd ci` or `npm.cmd run dev` in PowerShell. |
| Missing/short JWT secret | Configure a random secret of at least 32 characters, restart the backend and sign in again. |
| Database `ENOTFOUND`, `ECONNRESET` or connection timeout | Check the database hostname, DNS/network access, credentials and service availability. A successful application start does not guarantee later database connectivity. |
| Missing relation/column or export schema error | Run the registered migrations against the intended database and inspect migration errors. Do not recreate a populated database as a shortcut. |
| Summary reports missing configuration | Confirm the backend process has `GEMINI_API_KEY` and the intended model, then restart it. Never paste a real key into an issue or PR. |
| Gemini HTTP 503 | Temporary provider unavailability; bounded retries may still fail. Retry later or use an available model. A new key is not automatically a remedy. |
| Summary PDF text/input limit | Check the extraction limits above. Original passages are not silently dropped to make a request fit. |
| `standardFontDataUrl` warning | A PDF.js font-data warning is distinct from Gemini rejection or a database connection failure. Inspect the actual request/job error before diagnosing it as the cause. |
| HTTP 502 from the Vite proxy | Check the backend process and proxy target. The backend may be unavailable; inspect its terminal output. |
| Browser-test port already in use | Stop old test API/preview processes on ports 5056 and 5176 before rerunning. |
| Export lacks a new summary | Confirm that generation finished and saved successfully before requesting another research export. |

## Repository and contributions

Group repository: <https://github.com/omp091220-git/Collaborative-Research-Paper-Explorer>

Keep secrets and uploaded research PDFs out of commits. Review user-content visibility and permissions whenever adding an API or export. Do not infer a project-wide open-source license from an individual package's license field; check the repository's licensing terms before redistribution.
