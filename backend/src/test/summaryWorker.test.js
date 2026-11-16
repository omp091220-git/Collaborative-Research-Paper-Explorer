import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSummaryWorker, reserveSummarySlot } from '../workers/summaryWorker.js';
import { generateSummary } from '../services/summary.service.js';

test('a backend without a Gemini key never consumes or expires shared summary jobs',async()=>{
 const worker=createSummaryWorker({configured:()=>false,repository:{
  expireExhausted:async()=>assert.fail('unconfigured server must leave shared jobs untouched'),
  claim:async()=>assert.fail('unconfigured server must not claim shared work'),
 }});
 worker.start();await worker.stop();
});

test('configured background workers claim only their configured model',async()=>{
 let claimed,processed=false;
 const worker=createSummaryWorker({configured:()=>true,model:()=> 'configured-model',repository:{
  expireExhausted:async()=>{},claim:async model=>{claimed=model;return {id:'job'};},
 },processJob:async()=>{processed=true;}});
 worker.start();await worker.stop();
 assert.equal(claimed,'configured-model');assert.equal(processed,true);
});

test('Gemini HTTP failures are classified safely and network failures remain retryable',async()=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='private-test-key';
 const expected={400:'AI_INVALID_REQUEST',401:'AI_AUTH_FAILED',403:'AI_ACCESS_DENIED',404:'AI_MODEL_UNAVAILABLE',429:'AI_RATE_LIMITED',500:'AI_PROVIDER_UNAVAILABLE'};
 try {
  for(const [status,code] of Object.entries(expected)) {
   await assert.rejects(generateSummary([],'brief','model',async()=>new Response('private-test-key paper text',{status:Number(status)})),e=>
    e.code===code && !e.message.includes('private-test-key') && e.retryable===(Number(status)===429||Number(status)>=500));
  }
  await assert.rejects(generateSummary([],'brief','model',async()=>new Response(JSON.stringify({error:{details:[{reason:'API_KEY_INVALID'}]}}),{status:400})),e=>e.code==='AI_AUTH_FAILED'&&!e.retryable);
  await assert.rejects(generateSummary([],'brief','model',async()=>{throw new TypeError('fetch failed');}),e=>e.code==='AI_CONNECTION_FAILED'&&e.retryable);
  await assert.rejects(generateSummary([],'brief','model',async()=>{throw Object.assign(new Error('slow'),{name:'TimeoutError'});}),e=>e.code==='AI_TIMEOUT'&&e.retryable);
 } finally {if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}
});

test('request processing is bounded and capacity is released idempotently',()=>{
 const one=reserveSummarySlot(),two=reserveSummarySlot();
 assert.equal(typeof one,'function');assert.equal(typeof two,'function');
 assert.equal(reserveSummarySlot(),null);one();one();
 const three=reserveSummarySlot();assert.equal(typeof three,'function');
 two();three();
});
