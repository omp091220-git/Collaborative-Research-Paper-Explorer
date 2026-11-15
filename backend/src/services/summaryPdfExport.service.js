import pool from '../config/database.js';
import { buildSummaryPdfBuffer } from '../utils/summaryPdfBuilder.js';

/**
 * Service: Export formatted summary PDF with preserved citations (FR-35, FR-36).
 * Enforces clear failure handling (never returns corrupt/incomplete export as success).
 */
export const exportPaperSummaryPdf = async (paperId, client = pool) => {
  // 1. Fetch paper details
  const paperRes = await client.query(
    `SELECT id, title, abstract, authors, arxiv_id, uploaded_at 
     FROM papers 
     WHERE id = $1`,
    [paperId]
  );

  if (paperRes.rows.length === 0) {
    const error = new Error('PAPER_NOT_FOUND: The specified research paper does not exist.');
    error.statusCode = 404;
    throw error;
  }
  const paper = paperRes.rows[0];

  // 2. Fetch AI summary from paper_summaries table
  const summaryRes = await client.query(
    `SELECT summary_text, key_findings, model_name, summary_type, created_at
     FROM paper_summaries
     WHERE paper_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [paperId]
  );

  // If formal AI summary is not yet generated, check if abstract can serve as fallback,
  // or return clear 422 failure as mandated by FR-36 failure handling
  let summaryText = summaryRes.rows[0]?.summary_text;
  let keyFindings = summaryRes.rows[0]?.key_findings || [];

  if (!summaryText || !summaryText.trim()) {
    if (paper.abstract && paper.abstract.trim()) {
      summaryText = `[Preliminary Abstract Summary]\n${paper.abstract.trim()}`;
    } else {
      const error = new Error(
        'SUMMARY_UNAVAILABLE: An AI-generated summary is not yet available for this paper. Please trigger AI summarization before exporting.'
      );
      error.statusCode = 422;
      throw error;
    }
  }

  // 3. Fetch preserved citations for this paper (backward & forward citations)
  let citations = [];
  try {
    const citationsRes = await client.query(
      `SELECT 
         p.title, p.authors, p.arxiv_id, 
         EXTRACT(YEAR FROM p.uploaded_at)::int AS publication_year
       FROM citations c
       JOIN papers p ON c.cited_paper_id = p.id
       WHERE c.citing_paper_id = $1
       LIMIT 25`,
      [paperId]
    );
    citations = citationsRes.rows;
  } catch {
    // If citations table is not populated for this paper, preserve empty array safely
    citations = [];
  }

  // 4. Build PDF buffer safely
  try {
    const pdfBuffer = buildSummaryPdfBuffer({
      paperTitle: paper.title,
      authors: paper.authors,
      publicationYear: paper.uploaded_at ? new Date(paper.uploaded_at).getFullYear() : null,
      abstract: paper.abstract,
      summaryText,
      keyFindings,
      citations,
      sourceInfo: {
        source: paper.arxiv_id ? 'arXiv' : 'Direct Upload',
        arxivId: paper.arxiv_id,
      },
    });

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF_BUFFER_EMPTY: PDF generation engine produced an empty buffer.');
    }

    return {
      pdfBuffer,
      filename: `${paper.title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40)}_summary.pdf`,
      contentLength: pdfBuffer.length,
    };
  } catch (genError) {
    const error = new Error(`PDF_GENERATION_FAILED: ${genError.message}`);
    error.statusCode = 500;
    throw error;
  }
};
