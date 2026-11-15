import { exportPaperSummaryPdf } from '../services/summaryPdfExport.service.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Controller: Export research paper AI summary as formatted PDF (FR-35, FR-36).
 * Preserves citations, title, authors, source metadata.
 * Returns structured JSON error if export or generation fails.
 * GET /api/papers/:id/export/summary-pdf
 */
export const exportSummaryPdf = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) {
      return res.status(400).json({
        error: 'INVALID_PAPER_ID',
        message: 'A valid paper UUID is required to export summary PDF.',
      });
    }

    const { pdfBuffer, filename, contentLength } = await exportPaperSummaryPdf(id);

    // Set standard binary download headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message.split(':')[0],
        message: error.message.replace(/^[^:]+:\s*/, ''),
      });
    }
    return next(error);
  }
};
