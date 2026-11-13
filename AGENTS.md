# AGENTS.md — Collaborative Research Paper Explorer

Full-stack app: React 19 + Vite + Tailwind (frontend/), Node 22 + Express 5 ESM (backend/),
PostgreSQL 15+, optional Redis + BullMQ for the summary queue. Node >= 22.13 required.

## Commands
- Backend install: `cd backend && npm ci`
- Frontend install: `cd frontend && npm ci`
- Backend tests (all): `cd backend && npm test`
- Single backend test file: `cd backend && node --import ./src/test/setup.js --test src/test/<file>.test.js`
- FR-08 tests: `cd backend && npm run test:fr08`
- Apply migrations: `cd backend && npm run migrate`
- Frontend lint: `cd frontend && npm run lint`
- Frontend build: `cd frontend && npm run build`

## Test environment
- Tests need a local PostgreSQL. Use `TEST_DATABASE_URL`
  (default: `postgresql://postgres:postgres@localhost:5432/collaborative_research_test`).
- Run `npm run migrate` against the TEST database before running tests.
- NEVER point DATABASE_URL / TEST_DATABASE_URL at a real or shared database (e.g. Neon).
- Never create or commit a `.env` file or secrets. Use `.env.example` for new variable names.
- Redis and the Gemini API are not available in tests unless stated; do not add tests that need them.

## Project structure (backend/src)
- routes/modules -> controllers/ -> services/ -> repositories/ (SQL lives only in repositories/)
- middleware/ (authenticate, authorize, paperAccess, rateLimiter), config/, queues/, workers/
- Tests live in `backend/src/test/*.test.js` (Node test runner + supertest). Follow existing style.
- Follow the existing layering. Do not put SQL in controllers or business logic in repositories.

## Git workflow (strict)
- NEVER commit to `main`. Create a new branch from the current main:
  `feature/<fr-id>-<short-description>` (e.g. `feature/fr-09-figure-extraction`).
- One branch = one feature. Keep commits small and focused. Do not refactor unrelated code.
- The PR description must list: summary, files changed, new migration files, how it was tested,
  and any risk to existing data.

## Database rules (strict — existing data must never be lost)
1. ALL schema changes go in a NEW migration file in `database/` (repo root).
   - Name: `YYYYMMDD_short_description.sql` using today's date. Use a date >= the newest file.
   - `database/` is the source of truth. `backend/migrations/` is outdated: do not use it.
2. Register every new file by appending its filename to the `migrationFiles` array, in order, in
   `backend/src/scripts/migrate.js`. Files not in that array are never applied.
3. NEVER edit an existing migration or `schema.sql` that has already been merged.
4. Each file runs inside a single transaction, so do NOT use `CREATE INDEX CONCURRENTLY`
   or other statements that cannot run in a transaction.
5. Make migrations idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`. Guard enum/constraint changes with `DO $$ ... $$` blocks.
6. FORBIDDEN without explicit approval from me: `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`,
   `DELETE` without a narrow WHERE, destructive type changes, one-step renames.
7. Prefer additive changes: new tables, new nullable columns, or columns with safe DEFAULTs.
   New NOT NULL columns must have a DEFAULT, or be added nullable, backfilled, then constrained.
8. For risky changes use expand/contract: add the new structure, copy/backfill data, keep the old one.
   Propose the cleanup as a separate follow-up and do not do it yourself.
9. The runner has no down step. Put a commented `-- ROLLBACK:` block with the reverse SQL at the
   bottom of every migration (comments only, so it is never executed).
10. Prove data safety: on the test DB, seed sample rows BEFORE applying your migration, apply it,
    then show row counts and values are unchanged. Also run `npm run migrate` twice to confirm it is
    idempotent. Report the results in your summary.

## Definition of done
- `cd backend && npm test` passes, and `cd frontend && npm run lint && npm run build` passes
  if the frontend changed.
- New behavior has tests next to the existing ones.
- Migrations follow every rule above and are registered in migrate.js.
- Final summary lists: changed files, new migration files, tests run with results, and anything uncertain.
