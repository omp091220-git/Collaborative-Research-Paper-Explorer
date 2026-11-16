import * as repository from '../repositories/summary.repository.js';
import { processSummaryJob } from '../services/summary.service.js';

export function createSummaryWorker() {
 let timer; let active; let stopped=true;
 const tick=async()=>{
  if(stopped || active) return;
  active=(async()=>{
   await repository.expireExhausted();
   const job=await repository.claim();
   if(job) await processSummaryJob(job);
  })().catch(()=>console.error('Summary worker could not process its queue.')).finally(()=>{active=null;});
  await active;
 };
 return {
  start(){if(!stopped)return;stopped=false;timer=setInterval(tick,3000);timer.unref();void tick();},
  async stop(){stopped=true;clearInterval(timer);if(active)await active;}
 };
}
