import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRoles, requirePermission } from '../middleware/authorize.js';
import { ROLES, PERMISSIONS } from '../utils/roles.js';
import { researchExportController } from '../controllers/researchExport.controller.js';

export function createResearchExportRouter(exporter) {
  const router = express.Router({mergeParams:true});
  // Match the shared paper library's read policy, including students.
  router.get('/export', authenticateToken, authorizeRoles(...Object.values(ROLES)),
    requirePermission(PERMISSIONS.PAPERS_READ), researchExportController(exporter));
  return router;
}
export default createResearchExportRouter();
