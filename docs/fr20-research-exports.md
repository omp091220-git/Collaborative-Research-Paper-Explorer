# FR-20: research exports

Each paper now has an **Export** button. Choose Markdown, BibTeX, or annotated
PDF, then **Download export**. Students, researchers and administrators can export
papers they can read in the shared library. No new summaries or AI calls are made.

## Output

- **Markdown (.md):** metadata; annotations with page regions; all saved summary
  perspectives/models, including FR-08 sources and legacy key findings; hierarchical
  paper/annotation/paragraph/section tags; outgoing citations. Empty categories are
  explicit. Literal fenced blocks preserve Unicode, Markdown and LaTeX while
  preventing user HTML or headings from changing the report structure.
- **BibTeX (.bib):** one `@misc` entry per paper/reference, stable UUID-based keys,
  `and`-separated authors, DOI/arXiv metadata and actual publication years where
  known. Missing years are omitted. The main entry's `annote` field contains the
  complete research report; `keywords` holds tag paths. TeX characters are escaped.
  Use a Unicode-capable bibliography workflow for non-ASCII metadata.
- **Annotated PDF (.pdf):** original pages with native highlights/comments for
  regions and page comments for notes without regions. A research comment on page
  one contains the full report. A readable, searchable research report is also
  appended after the original pages, including all four content categories and
  source-page references. No comments or attachments panel is required to read it.
  `research-notes.md` and `references.bib` are embedded
  attachments. Unicode comments use UTF-16 PDF strings. Existing pages, text,
  rotations, crop boxes and annotations are preserved. Invalid saved page numbers
  are reported instead of silently placed elsewhere. Use a reader with **Comments**
  and **Attachments** panels, such as Acrobat Reader; browser viewers may not expose
  them. The visible report and comments retain source Markdown/LaTeX without
  mathematical typesetting. The appendix embeds the redistributable DejaVu Sans
  font, so it works on Windows without installing fonts. Characters outside that
  font are labelled with Unicode code points; exact originals remain in comments
  and attachments.

Original-PDF downloads, the metadata BibTeX copy button, and standalone summary-PDF
exports (`/api/papers/:id/export/summary-pdf`, FR-35/36) are unchanged.

## API and setup

`GET /api/papers/:paperId/export?format=markdown|bibtex|pdf`

Requires the existing session cookie/bearer token and paper-read permission.
Responses are attachments with explicit content types and private/no-store cache
headers. Invalid IDs/formats return 400; missing papers 404; unavailable original
PDFs 422; database disconnects/missing migrations 503. Text exports work without a
PDF or AI key.

A read-only repeatable-read transaction collects the data and releases its client
before formatting or downloading the source PDF. Parameterized SQL stays in the
repository. Exports never change records, or include emails, secrets, internal
file paths or embeddings.

No new migrations or environment variables are needed. The existing main schema,
including FR-08's structured-summary migration, must already be applied. Install
the updated backend lockfile with `npm ci`; PDF editing uses `pdf-lib` and `@pdf-lib/fontkit`. Original
PDF retrieval reuses FR-08's validated uploads and fixed arXiv host, its 32 MiB
input limit, and a maximum of 150 pages for annotated exports.

## Validation

Use a **localhost test database**, never shared Neon. The focused suite creates an
isolated schema and checks all tag stores, legacy/structured summaries, paper
isolation, unchanged rows, rollback, permissions, headers, escaping, original
pages, Unicode, attachments and crop/rotation geometry at 0/90/180/270 degrees.

Windows Command Prompt, from the repository root (one line):

```cmd
cd backend && set "TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/fr08_local_test" && npm run test:fr20
```

Frontend validation: `npm run build` and ESLint on the two changed components.
Manual check: open a paper with saved annotations, summaries and tags; download
all formats; inspect the Markdown/BibTeX, and PDF comments/attachments; confirm
highlights mark the expected passages. An AI key is not required.
