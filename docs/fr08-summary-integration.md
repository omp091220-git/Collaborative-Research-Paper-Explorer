# FR-08 integration on main 6a3f1bf

FR-08 generates Background, Methodology, Results, and Limitations using Gemini,
with citations linked to PDF text-item coordinates. The existing summary modal
and four perspectives remain: comprehensive, brief, technical, and layperson.
The main PDF reader and its routes are unchanged. FR-20 is separate work.

## Access

This implementation follows main's current library access policy: authenticated
Students, Researchers, and System Admins can read library papers. Those roles
already have the summaries:generate permission. Summary APIs validate the paper
exists and enforce those existing role permissions. They do not require the
uploader/collection-only check from the discarded branch. Collaborator-management
permissions are unchanged. This does not introduce a new public/private paper
model; if main adds paper-level privacy later, its shared read-access resolver
must also protect the summary endpoints.

## Setup

The only new migration is database/20261116_structured_summaries.sql, appended to
the existing runner. It adds structured_summary_jobs and structured_summary_cache
without changing existing migration files, schema.sql or existing columns/data.
It is required before running the feature with a Gemini key. Review application
of this migration with the database maintainer before using a shared team DB.
Do not run automated tests or experimental migrations against shared Neon data.

Set GEMINI_API_KEY privately in the backend process. GEMINI_SUMMARY_MODEL selects
the model, with GEMINI_MODEL accepted as a fallback; default gemini-3.5-flash-lite.
Verify the chosen model is available to the actual key. No new npm dependencies
or lockfile changes are required. HTTPS to generativelanguage.googleapis.com and,
for arXiv papers, arxiv.org must be available. Honor the environment's proxy and
TLS trust settings (NODE_USE_ENV_PROXY=1 where required on Node 24).

Run the existing backend npm run dev or npm start. The durable summary worker
starts/stops with the backend. There is no separate worker command or Redis
requirement for FR-08. Newly uploaded/imported papers queue a comprehensive job
in their existing upload transaction when a key is configured. Existing papers
are summarized on explicit user request; enabling the feature does not bulk-send
the shared library to Gemini. The normal frontend npm run dev still applies.

## API and persistence

GET /api/papers/:paperId/summaries?type=comprehensive returns the current job or
{"summary":null}. POST to that same endpoint with {"type":"technical"} queues or
reuses the current result. Both endpoints require authentication and the main
paper-read roles. POST also enforces the existing summaries:generate permission.
Missing papers return 404; invalid IDs/types return 400; an unconfigured provider
returns 503 for new jobs. Completed summaries can still be read without a key.

Jobs persist pending/processing/completed/failed states. Claims use SKIP LOCKED,
lease tokens fence reclaimed workers, expired leases are recovered, and transient
failures retry up to three times with backoff. Failed jobs can be manually retried.
Cache keys combine exact-PDF SHA-256, perspective and model. Advisory locks avoid
concurrent duplicate AI generation. Completion writes structured job/cache data
and the existing paper_summaries.summary_text in one transaction, retaining
compatibility with the existing summary PDF export. Successful provider usage
is recorded through the existing GenAI monitoring service; a monitoring failure
does not discard a successfully generated summary.

## Original evidence and limits

For arXiv records, FR-08 fetches the original PDF from the fixed arxiv.org host
using a validated identifier. It does not summarize the viewer's synthesized
metadata/report fallback. Source links for these records open the original arXiv
PDF page. For local uploads, the real path must remain below uploads (including
symlink resolution), have a PDF header, and contain actual readable PDF text.
Known generated summary/report documents from the fallback builder are rejected
as source papers. Missing sources fail visibly; abstract-based prose is never
substituted as a real manuscript summary.

Source IDs, pages and boxes come from PDF.js text extraction, not the model.
Boxes use normalized top-left viewport coordinates with page rotation. Gemini
returns only source IDs. Unknown citations, incomplete output and unsupported
uncited claims are rejected. Unsupported sections explicitly say "Not reported
in the paper." Source selection validates linkage, not scientific truth; users
should verify claims against the cited original passages.

Limits: 32 MiB source guard (normal uploads remain 30 MiB), 150 pages, 100,000 text
characters, 20,000 text items, 45-second network timeout, and 30 citations per
section. Scanned PDFs need OCR outside this implementation. Existing source files
are treated as immutable; in-place PDF replacement is not a supported workflow.

## Validation

Use backend/npm run test:fr08 with TEST_DATABASE_URL pointing only at a dedicated
local PostgreSQL test DB. Tests cover student access, missing resources, provider
JSON and source-ID validation, real/rotated PDF extraction, queue claims, stale
workers, retries/backoff, caching, upload enqueueing, usage reporting, and export-
compatible persistence. Provider HTTP responses are mocked; no billable Gemini
calls are made. The database test creates a unique local schema and applies the
new migration twice after seeding sample rows, asserting values/counts preserved.

Browser smoke tests exercise the actual modal with mocked API responses and cover
its four existing perspective cards, generation/polling, all sections, source
links, switching perspective, failure/retry and desktop/mobile rendering.

Main's migration chain still contains the unrelated notifications.user_id versus
recipient_id conflict on fresh databases. This feature does not change or skip
those historical migrations. The new migration is validated independently; the
existing chain must be corrected separately for a reproducible fresh install.
Repository-wide existing lint/test failures are detailed in the delivery report.

## Connection reset recovery

The pool observes checked-out clients as well as idle pool errors, preventing
transport errors such as ECONNRESET from becoming unhandled Node events. Broken
summary clients are discarded; transient database errors retry within the job's
existing attempt limit. Source/model output is not marked successful on a lost
connection. The socket reset itself may still require network/provider diagnosis.

Content deduplication uses a transaction-scoped advisory lock, compatible with
Neon's transaction-mode pooled connections. Lock waits and SQL statements have
bounded timeouts. The same transaction owns cache reads and summary completion;
no inner commit releases the caller's lock early. A new lock-key namespace avoids
waiting on any legacy session-scoped locks left by an interrupted older worker.
There is no schema migration for this recovery change.

Connection regression tests deliberately terminate a local PostgreSQL connection
while it is checked out, verify the process survives and a fresh query succeeds,
and check healthy transaction cleanup, lock serialization, timeouts, safe socket
discard and retryable job errors. Never run this fault-injection suite against a
shared database.

Recovery validation: 20 focused tests pass. Full backend: 841 tests, 808 pass,
the same 33 baseline failures, zero skipped/cancelled. Frontend build, changed-
component lint, and the desktop/mobile browser smoke checks pass.

Device validation: live Brief/Executive generation and saved-summary retrieval
succeeded with gemini-3.5-flash-lite. This is now the configurable default; verify
availability for each runtime key. Model metadata access alone does not establish
generation access or quota.

## PR #53 target-branch reconciliation

PR #53 targets the group's fr-08 branch, which contains the superseded early
FR-08 implementation. Its history is merged into this feature branch while the
tested current-main application code is retained. Obsolete duplicate SDK/Redis
workers, UI and tests are replaced by this integration. The two copies of
20261025_fr08_ai_summaries.sql are retained unchanged for historical deployments;
the current runner does not newly register or execute that obsolete migration.
No SQL is executed as part of conflict resolution, and no existing database
objects or user data are removed. The PR also carries main updates absent from
the older target branch, so reviewers should review the full branch comparison.


### Shared development databases

Summary requests now reserve their job lease atomically on the receiving backend
and start there immediately. Other backends using the same Neon database cannot
steal that lease while it is active. Duplicate requests reuse the existing job.
Up to two requested summaries run per backend at once; additional requests receive
a clear busy response. Graceful shutdown waits for requested jobs as well.

Unconfigured background workers no longer claim or expire shared jobs. Configured
workers drain jobs for their configured model only. Retryable failures still use
the existing durable queue, cache and fenced lease contract. Update other team
backends too so their background workers follow these safeguards.

Gemini HTTP 400/401/403/404/429 and provider/network failures now have distinct,
actionable UI messages. Logs include only the classified error, HTTP status and
model; raw provider responses, API keys and paper text are not logged or persisted.
The summary extractor supplies PDF.js's installed standard-font directory, avoiding
its missing `standardFontDataUrl` warning. No migration or new key is required.
