import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createSummaryRepository } from '../repositories/summary.repository.js';
import { processSummaryJob, HEADINGS } from '../services/summary.service.js';

test('FR-08 migration preserves data; durable queue, fencing, retries, cache and export persistence',async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
 assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && url.pathname.includes('test'),'local test DB required');
 const schema='fr08_test_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:url.href});
 let db;
 try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  db=new pg.Pool({connectionString:url.href,options:`-c search_path=${schema},public`});
  await db.query(await fs.readFile(new URL('../../../database/schema.sql',import.meta.url),'utf8'));
  const owner=(await db.query(`INSERT INTO users(email,password_hash,full_name) VALUES('fr08@example.edu','test-only-hash','FR08 Test') RETURNING id`)).rows[0].id;
  const paper=(await db.query(`INSERT INTO papers(title,authors,file_path,file_size_bytes,mime_type,uploader_id)
   VALUES('Preserve me',ARRAY['Original Author'],'uploads/fr08-one.pdf',100,'application/pdf',$1) RETURNING *`,[owner])).rows[0];
  await db.query(`INSERT INTO paper_summaries(paper_id,model_name,summary_text) VALUES($1,'legacy-model','Existing summary')`,[paper.id]);
  const before=(await db.query('SELECT * FROM papers')).rows;
  const summaryBefore=(await db.query('SELECT * FROM paper_summaries')).rows;
  const migration=await fs.readFile(new URL('../../../database/20261116_structured_summaries.sql',import.meta.url),'utf8');
  // Same transaction contract as the production migration runner, executed twice.
  for(let n=0;n<2;n++) {
   const client=await db.connect();
   try {await client.query('BEGIN');await client.query(migration);await client.query('COMMIT');}
   catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  assert.deepEqual((await db.query('SELECT * FROM papers')).rows,before);
  assert.deepEqual((await db.query('SELECT * FROM paper_summaries')).rows,summaryBefore);
  assert.equal((await db.query('SELECT count(*)::int n FROM users')).rows[0].n,1);
  const repo=createSummaryRepository(db);
  const queued=await repo.enqueue(paper.id,'comprehensive','model');
  assert.equal((await repo.enqueue(paper.id,'comprehensive','model')).id,queued.id);
  let calls=0;
  const sections=HEADINGS.map(heading=>({heading,text:'Evidence.',sources:[{id:'s0',page:1,x:0,y:0,width:0.2,height:0.02}]}));
  const deps={repository:repo,readPdf:async()=>Buffer.from('same bytes'),extract:async()=>[],generate:async()=>{calls++;return sections;}};
  const claimed=await repo.claim();assert.equal(claimed.status,'processing');
  assert.equal(await repo.claim(),undefined);
  await processSummaryJob(claimed,deps);
  assert.equal((await repo.findJob(paper.id,'comprehensive','model')).status,'completed');
  assert.match((await db.query('SELECT summary_text FROM paper_summaries WHERE model_name=$1',['model'])).rows[0].summary_text,/Limitations/);
  assert.deepEqual((await db.query('SELECT summary_text FROM paper_summaries WHERE model_name=$1',['legacy-model'])).rows,[{summary_text:'Existing summary'}]);
  const copy=(await db.query(`INSERT INTO papers(title,authors,file_path,file_size_bytes,mime_type,uploader_id)
   VALUES('Duplicate PDF',ARRAY['Author'],'uploads/fr08-two.pdf',100,'application/pdf',$1) RETURNING id`,[owner])).rows[0].id;
  await repo.enqueue(copy,'comprehensive','model');
  await processSummaryJob(await repo.claim(),deps);
  assert.equal(calls,1,'duplicate bytes should not incur another AI call');
  assert.equal((await repo.findJob(copy,'comprehensive','model')).status,'completed');
  await repo.enqueue(paper.id,'brief','model');await repo.enqueue(paper.id,'technical','model');
  const [one,two]=await Promise.all([repo.claim(),repo.claim()]);assert.notEqual(one.id,two.id);
  await repo.fail({...one,lease_token:randomUUID()},'INVALID_AI_RESPONSE',true);
  assert.equal((await repo.findJob(paper.id,one.summary_type,'model')).status,'processing','stale worker cannot mutate job');
  await repo.fail(one,'AI_RATE_LIMITED',true);
  assert.equal((await repo.findJob(paper.id,one.summary_type,'model')).status,'pending');
  assert.equal(await repo.claim(),undefined,'backoff must delay retry');
  await db.query(`UPDATE structured_summary_jobs SET available_at=now()-interval '1 second' WHERE id=$1`,[one.id]);
  const again=await repo.claim();assert.equal(again.attempts,2);
  await repo.fail(again,'INVALID_AI_RESPONSE',true);
  await db.query(`UPDATE structured_summary_jobs SET available_at=now()-interval '1 second' WHERE id=$1`,[one.id]);
  const third=await repo.claim();assert.equal(third.attempts,3);await repo.fail(third,'AI_RATE_LIMITED',true);
  assert.equal((await repo.findJob(paper.id,one.summary_type,'model')).status,'failed');
  await repo.retry(paper.id,one.summary_type,'model');
  assert.equal((await repo.findJob(paper.id,one.summary_type,'model')).attempts,0);
  await db.query(`UPDATE structured_summary_jobs SET lease_until=now()-interval '1 second',attempts=3 WHERE id=$1`,[two.id]);
  await repo.expireExhausted();assert.equal((await repo.findJob(paper.id,two.summary_type,'model')).status,'failed');
  console.log('FR-08 migration twice: 1 user, 1 paper and 1 existing summary preserved with identical values.');
 } finally {if(db)await db.end();await admin.end();}
});
