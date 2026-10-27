-- ==============================================================================
-- FR-16: Interactive Citation Graph — Citations Directed Graph Table
-- Target: PostgreSQL 15+ (Neon / Local)
--
-- Directed edge:
--   citing_paper_id  -> The paper that contains the reference (source of citation)
--   cited_paper_id   -> The paper that is referenced (target of citation)
--
-- Backward references of Paper X:
--   SELECT * FROM citations WHERE citing_paper_id = X (papers cited by X)
--
-- Forward citations of Paper X:
--   SELECT * FROM citations WHERE cited_paper_id = X (papers that cite X)
--
-- Co-citation clusters:
--   Pairs of papers cited together by common citing papers.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citing_paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    cited_paper_id  UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    citation_context TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_no_self_citation CHECK (citing_paper_id <> cited_paper_id),
    CONSTRAINT uq_citation_pair UNIQUE (citing_paper_id, cited_paper_id)
);

CREATE INDEX IF NOT EXISTS idx_citations_citing ON citations(citing_paper_id);
CREATE INDEX IF NOT EXISTS idx_citations_cited  ON citations(cited_paper_id);
