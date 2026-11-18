import * as repository from '../repositories/summary.repository.js';
import { processSummaryJob, summaryModel } from '../services/summary.service.js';

const requestedJobs = new Set();
let requestedSlots=0;
export function reserveSummarySlot() {
 if(requestedSlots>=2) return null;
 requestedSlots++;
 let released=false;
 return ()=>{if(!released){released=true;requestedSlots--;}};
}
export function dispatchRequestedSummary(job) {
 const task = processSummaryJob(job).catch(error => {
  console.error('Requested summary could not finish:', error.code || 'SUMMARY_QUEUE_ERROR');
 }).finally(() => requestedJobs.delete(task));
 requestedJobs.add(task);
 return task;
}

export function createSummaryWorker(deps = {}) {
 const repo = deps.repository || repository;
 const processJob = deps.processJob || processSummaryJob;
 const configured = deps.configured || (() => Boolean(process.env.GEMINI_API_KEY?.trim()));
 const model = deps.model || summaryModel;
 let timer; let active; let stopped=true;
 const tick=async()=>{
  // A teammate's unconfigured backend must not consume shared jobs and fail them.
  if(stopped || active || !configured()) return;
  active=(async()=>{
   await repo.expireExhausted();
   const job=await repo.claim(model());
   if(job) await processJob(job);
  })().catch(error=>console.error('Summary worker could not process its queue:', error.code || 'SUMMARY_QUEUE_ERROR')).finally(()=>{active=null;});
  await active;
 };
 return {
  start(){if(!stopped)return;stopped=false;timer=setInterval(tick,3000);timer.unref();void tick();},
  async stop(){stopped=true;clearInterval(timer);if(active)await active;await Promise.allSettled([...requestedJobs]);}
 };
}
