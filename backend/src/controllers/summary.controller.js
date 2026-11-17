import * as repository from '../repositories/summary.repository.js';
import { isValidUUID } from '../middleware/paperAccess.js';
import { SUMMARY_TYPES, summaryModel } from '../services/summary.service.js';
import { dispatchRequestedSummary, reserveSummarySlot } from '../workers/summaryWorker.js';

export function createSummaryController(deps={}) {
 const repo=deps.repository || repository;
 const dispatch=deps.dispatch || dispatchRequestedSummary;
 const reserveSlot=deps.reserveSlot || reserveSummarySlot;
const validType=(req)=>req.method==='GET' ? (req.query.type || 'comprehensive') : (req.body?.type || 'comprehensive');
async function getSummary(req,res,next) {
 try {
  if(!isValidUUID(req.params.paperId)) return res.status(400).json({error:'Invalid paper ID.'});
  if(!await repo.paperExists(req.params.paperId)) return res.status(404).json({error:'Paper not found.'});
  const type=validType(req);
  if(!SUMMARY_TYPES.includes(type)) return res.status(400).json({error:'Invalid summary type.'});
  const job=await repo.findJob(req.params.paperId,type,summaryModel());
  return res.json({summary:job});
 } catch(e){next(e);}
}
async function requestSummary(req,res,next) {
 try {
  if(!isValidUUID(req.params.paperId)) return res.status(400).json({error:'Invalid paper ID.'});
  if(!await repo.paperExists(req.params.paperId)) return res.status(404).json({error:'Paper not found.'});
  const type=validType(req);
  if(!SUMMARY_TYPES.includes(type)) return res.status(400).json({error:'Invalid summary type.'});
  const existing=await repo.findJob(req.params.paperId,type,summaryModel());
  if(existing && existing.status!=='failed' && existing.status!=='pending') {
   return res.status(existing.status==='completed'?200:202).json({summary:existing});
  }
  if(!process.env.GEMINI_API_KEY?.trim()) return res.status(503).json({error:'AI summaries are not configured on this server.'});
  const release=reserveSlot();
  if(!release) return res.status(503).json({error:'This server is already generating two summaries. Please retry shortly.'});
  try {
  const reserved=await repo.reserveForRequest(req.params.paperId,type,summaryModel());
  if(reserved) {
   const {lease_token:_lease,lease_until:_until,...publicJob}=reserved;
   res.status(202).json({summary:publicJob});
   void dispatch(reserved).finally(release);
   return;
  }
  release();
  return res.status(202).json({summary:await repo.findJob(req.params.paperId,type,summaryModel())});
  } catch(error) {release();throw error;}
 } catch(e){next(e);}
}

return {getSummary,requestSummary};
}
export const {getSummary,requestSummary}=createSummaryController();
