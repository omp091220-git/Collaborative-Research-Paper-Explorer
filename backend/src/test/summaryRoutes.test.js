import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import pool from '../config/database.js';
const paperId='11111111-1111-4111-8111-111111111111';
const student='22222222-2222-4222-8222-222222222222';
const token=jwt.sign({id:student,role:'STUDENT'},process.env.JWT_SECRET);

test('students can summarize the same library papers they can read; missing and anonymous requests fail',async()=>{
 const original=pool.query,key=process.env.GEMINI_API_KEY;
 let row=null,exists=true,queued=0;
 pool.query=async(sql,args)=>{
  const text=String(sql);
  if(text.includes('FROM users'))return {rows:[{id:args[0],role:'STUDENT'}]};
  if(text.includes('FROM papers'))return {rows:exists?[{id:paperId,uploader_id:'another-user'}]:[]};
  if(text.includes('INSERT INTO structured_summary_jobs')){queued++;row={id:'job',status:'pending',sections:null};return {rows:[]};}
  if(text.includes('UPDATE structured_summary_jobs')){row={...row,status:'pending',attempts:0};return {rows:[]};}
  if(text.includes('FROM structured_summary_jobs'))return {rows:row?[row]:[]};
  return {rows:[]};
 };
 const route=`/api/papers/${paperId}/summaries`;
 const get=(url=route)=>request(app).get(url).set('Authorization',`Bearer ${token}`);
 const post=body=>request(app).post(route).set('Authorization',`Bearer ${token}`).send(body);
 try {
  assert.equal((await request(app).get(route)).status,401);
  assert.equal((await request(app).post(route).send({})).status,401);
  assert.equal((await get()).body.summary,null);
  assert.equal((await get('/api/papers/invalid/summaries')).status,400);
  exists=false;assert.equal((await get()).status,404);assert.equal((await post({})).status,404);exists=true;
  assert.equal((await post({type:'invalid'})).status,400);
  delete process.env.GEMINI_API_KEY;
  assert.equal((await post({})).status,503);
  process.env.GEMINI_API_KEY='test-only';
  assert.equal((await post({})).status,202);
  assert.equal((await post({})).status,202);assert.equal(queued,1);
  row={id:'job',status:'completed',sections:[]};delete process.env.GEMINI_API_KEY;
  assert.equal((await post({})).status,200);
  row={id:'job',status:'failed',attempts:3};process.env.GEMINI_API_KEY='test-only';
  const retry=await post({});assert.equal(retry.status,202);assert.equal(retry.body.summary.attempts,0);
 } finally {pool.query=original;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;}
});
