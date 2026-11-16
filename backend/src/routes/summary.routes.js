import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRoles, requirePermission } from '../middleware/authorize.js';
import { ROLES, PERMISSIONS } from '../utils/roles.js';
import { getSummary, requestSummary } from '../controllers/summary.controller.js';
export function createSummaryRouter(controllers = {getSummary, requestSummary}) {
const router = express.Router({mergeParams:true});
// The main paper library is readable by all three roles. Keep summary access aligned.
const read = [authenticateToken, authorizeRoles(ROLES.STUDENT, ROLES.RESEARCHER, ROLES.SYSTEM_ADMIN), requirePermission(PERMISSIONS.PAPERS_READ)];
router.get('/summaries', ...read, controllers.getSummary);
router.post('/summaries', ...read, requirePermission(PERMISSIONS.SUMMARIES_GENERATE), controllers.requestSummary);
return router;
}
export default createSummaryRouter();
