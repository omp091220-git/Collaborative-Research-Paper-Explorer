-- ==============================================================================
-- FR-07: Paper Metadata — Add DOI and publication_year to papers table
-- Target: PostgreSQL 15+ (Neon)
--
-- Both columns are nullable:
--   doi              — not every paper has a DOI; arXiv preprints often acquire
--                      one only after formal publication. Manual uploads may omit it.
--   publication_year — optional for manual uploads; extracted from arXiv API for imports.
--
-- DOI uniqueness:
--   A sparse unique index is used so that multiple NULL values are allowed
--   (representing papers without a known DOI), while any non-NULL DOI must be
--   globally unique across all papers.
--
-- Publication year constraint:
--   Academic publishing started in earnest from ~1665 (Philosophical Transactions).
--   A ceiling of 2100 accommodates future-dated pre-publication dates.
-- ==============================================================================

ALTER TABLE papers
  ADD COLUMN IF NOT EXISTS doi              VARCHAR(255),
  ADD COLUMN IF NOT EXISTS publication_year SMALLINT;

-- Sparse unique index: NULLs are not considered equal, so multiple NULL DOIs
-- are permitted. Only non-NULL DOI values must be unique. [DB]
CREATE UNIQUE INDEX IF NOT EXISTS idx_papers_doi
    ON papers (doi)
    WHERE doi IS NOT NULL;

-- Year range sanity check. NULL is explicitly allowed. [DB]
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_papers_publication_year'
  ) THEN
    ALTER TABLE papers
      ADD CONSTRAINT chk_papers_publication_year
        CHECK (
          publication_year IS NULL OR
          (publication_year >= 1665 AND publication_year <= 2100)
        );
  END IF;
END $$;
