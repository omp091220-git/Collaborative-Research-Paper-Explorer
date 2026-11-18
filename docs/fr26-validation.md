# FR-26 validation record

Base: `5fbfbb6` (FR-25 merge). All database writes used a localhost test database
and randomly named test schemas. No team Neon data was used or modified.

| Check | Result |
| --- | --- |
| FR-25 + FR-26 focused backend/API suite | 32 passed, 0 failed |
| Production-build browser scenarios | 48 passed, 0 failed |
| Frontend production build | Passed (built by the browser test runner) |
| ESLint on all changed frontend/config/browser-test files | Passed |
| Full backend before FR-26 | 939 tests: 898 passed, 41 failed |
| Full backend after FR-26 | 949 tests: 908 passed, the same 41 failed |
| Whole frontend lint before/after | Unchanged: 4 errors, 55 warnings |
| New backend failure names versus the untouched base | None |

Browser coverage used Chromium, desktop 1440x1000 and mobile 390x844, in both
light and dark modes, with additional width checks at 320/768/1440 pixels.
The real Express API, real FR-25 mutation routes and real PostgreSQL were used.
Only simulated network errors and delayed responses intercepted feed requests.

Verified scenarios:

- Guest public feed and safe public response fields; private canary text absent
  from both HTTP responses and the DOM.
- Search across titles, body, author names and tags; exact topic and linked-paper
  filters; wildcard escaping; malicious SQL strings treated as data.
- Stable UUID tie-break ordering, both sort directions, pagination, empty pages,
  URL reload/history and filter reset.
- Strict public detail access for owners, admins and explicitly authorized private
  readers; private/deleted/private-author posts remain unavailable publicly.
- Account and post visibility changes reflected in results and totals without
  deleting source records; legacy inconsistent public rows hidden for private
  authors; legacy read routes respect account privacy too.
- Actual FR-25 post creation, private creation, deletion and privacy changes.
- Loading, transient server failure, retry, invalid filter and missing-post states.
- Slow superseded search responses cannot replace current results.
- HTML/XSS payloads displayed literally; no execution.
- Keyboard search, mobile workspace entry, narrow layouts, a 200-character
  unbroken search term, target sizes and form-text contrast at least 4.5:1.
- Public landing-page entry without authentication.

The full-project baseline is not green. Its failures were reproduced in a separate,
unmodified checkout before development, and the final failing-test names match.
The four whole-frontend lint errors are pre-existing empty catch blocks in
`frontend/src/components/research/ResearchWorkspace.jsx`.

Because the user required everything to pass before pushing, the implementation
is held locally pending an explicit decision about these unchanged baseline
failures. This record does not claim perfect testing or a successful full suite.
