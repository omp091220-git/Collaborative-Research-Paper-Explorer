import * as repository from '../repositories/summary.repository.js';
import { isValidUUID } from '../middleware/paperAccess.js';
import { SUMMARY_TYPES, summaryModel } from '../services/summary.service.js';

const validType=(req)=>req.method==='GET' ? (req.query.type || 'comprehensive') : (req.body?.type || 'comprehensive');
export async function getSummary(req,res,next) {
 try {
  if(!isValidUUID(req.params.paperId)) return res.status(400).json({error:'Invalid paper ID.'});
  if(!await repository.paperExists(req.params.paperId)) return res.status(404).json({error:'Paper not found.'});
  const type=validType(req);
  if(!SUMMARY_TYPES.includes(type)) return res.status(400).json({error:'Invalid summary type.'});
  const job=await repository.findJob(req.params.paperId,type,summaryModel());
  return res.json({summary:job});
 } catch(e){next(e);}
}
export async function requestSummary(req,res,next) {
 try {
  if(!isValidUUID(req.params.paperId)) return res.status(400).json({error:'Invalid paper ID.'});
  if(!await repository.paperExists(req.params.paperId)) return res.status(404).json({error:'Paper not found.'});
  const type=validType(req);
  if(!SUMMARY_TYPES.includes(type)) return res.status(400).json({error:'Invalid summary type.'});
  const existing=await repository.findJob(req.params.paperId,type,summaryModel());
  if(existing?.status==='failed') {
   if(!process.env.GEMINI_API_KEY) return res.status(503).json({error:'AI summaries are not configured on this server.'});
   return res.status(202).json({summary:await repository.retry(req.params.paperId,type,summaryModel())});
  }
  if(existing) return res.status(existing.status==='completed'?200:202).json({summary:existing});
  if(!process.env.GEMINI_API_KEY) return res.status(503).json({error:'AI summaries are not configured on this server.'});
  const job=await repository.enqueue(req.params.paperId,type,summaryModel());
  return res.status(202).json({summary:job});
 } catch(e){next(e);}
}
