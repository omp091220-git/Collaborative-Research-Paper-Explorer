import { createResearchExport } from '../services/researchExport.service.js';
import { isPgConnectionError } from '../utils/pgClientErrors.js';

export function researchExportController(exporter = createResearchExport) {
  return async (req, res, next) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.paperId)) {
      return res.status(400).json({error:'A valid paper ID is required.'});
    }
    try {
      const result = await exporter(req.params.paperId, req.query.format);
      res.set({
        'Content-Type':result.type,
        'Content-Disposition':`attachment; filename="${result.filename}"`,
        'Content-Length':result.buffer.length,
        'Cache-Control':'private, no-store',
        'X-Content-Type-Options':'nosniff',
      });
      return res.send(result.buffer);
    } catch (error) {
      if (isPgConnectionError(error)) return res.status(503).json({error:'Database connection interrupted. Please retry the export.'});
      if (['42P01','42703'].includes(error.code)) return res.status(503).json({error:'Research exports need the current database migrations. Ask your administrator to update the schema.'});
      return next(error);
    }
  };
}
