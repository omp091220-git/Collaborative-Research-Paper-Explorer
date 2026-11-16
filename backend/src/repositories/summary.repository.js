import defaultPool from '../config/database.js';

export function createSummaryRepository(pool = defaultPool) {

const findJob = async (paperId, type, model) => (await pool.query(
  `SELECT id, paper_id, summary_type, model_name, status, attempts, sections, error_code, updated_at
   FROM structured_summary_jobs WHERE paper_id=$1 AND summary_type=$2 AND model_name=$3`, [paperId,type,model])).rows[0] || null;

const enqueue = async (paperId,type,model) => {
  await pool.query(`INSERT INTO structured_summary_jobs(paper_id,summary_type,model_name)
    VALUES($1,$2,$3) ON CONFLICT(paper_id,summary_type,model_name) DO NOTHING`,[paperId,type,model]);
  return findJob(paperId,type,model);
};

const claim = async () => (await pool.query(`WITH candidate AS (
 SELECT id FROM structured_summary_jobs
 WHERE attempts < 3 AND ((status='pending' AND available_at <= now()) OR (status='processing' AND lease_until < now()))
 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE structured_summary_jobs j SET status='processing',attempts=attempts+1,
 lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
 FROM candidate c WHERE j.id=c.id RETURNING j.*`)).rows[0];
const expireExhausted = async () => pool.query(`UPDATE structured_summary_jobs
 SET status='failed',error_code='WORKER_INTERRUPTED',updated_at=now()
 WHERE status='processing' AND lease_until < now() AND attempts >= 3`);
const paperFile = async (id) => (await pool.query('SELECT file_path, arxiv_id FROM papers WHERE id=$1',[id])).rows[0];
const paperExists = async (id) => (await pool.query('SELECT id FROM papers WHERE id=$1',[id])).rows.length > 0;

async function withContentLock(key, callback) {
 const client=await pool.connect();
 try {
  await client.query('SELECT pg_advisory_lock(hashtextextended($1,0))',[key]);
  return await callback(client);
 } finally {
  try { await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]); }
  finally { client.release(); }
 }
}
const readCache = async (client,hash,job) => (await client.query(
 `SELECT sections FROM structured_summary_cache WHERE content_hash=$1 AND summary_type=$2 AND model_name=$3`,
 [hash,job.summary_type,job.model_name])).rows[0]?.sections;

async function complete(client,job,hash,sections) {
 await client.query('BEGIN');
 try {
  const result=await client.query(`UPDATE structured_summary_jobs SET status='completed',sections=$3::jsonb,
   error_code=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='processing' RETURNING id`,
   [job.id,job.lease_token,JSON.stringify(sections)]);
  if (!result.rowCount) throw new Error('LEASE_LOST');
  await client.query(`INSERT INTO structured_summary_cache(content_hash,summary_type,model_name,sections)
   VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING`,[hash,job.summary_type,job.model_name,JSON.stringify(sections)]);
  const text=sections.map(s=>s.heading+'\n'+s.text).join('\n\n');
  await client.query(`INSERT INTO paper_summaries(paper_id,model_name,summary_type,summary_text)
   VALUES($1,$2,$3,$4) ON CONFLICT(paper_id,model_name,summary_type)
   DO UPDATE SET summary_text=EXCLUDED.summary_text`,[job.paper_id,job.model_name,job.summary_type,text]);
  await client.query('COMMIT');
 } catch(e) { await client.query('ROLLBACK'); throw e; }
}
const fail = async (job,code,retryable) => pool.query(`UPDATE structured_summary_jobs
 SET status=CASE WHEN $3 AND attempts < 3 THEN 'pending' ELSE 'failed' END,
 error_code=$4,available_at=now()+ attempts * interval '10 seconds',lease_until=NULL,updated_at=now()
 WHERE id=$1 AND lease_token=$2 AND status='processing'`,[job.id,job.lease_token,retryable,code]);

const retry = async (paperId,type,model) => {
 await pool.query(`UPDATE structured_summary_jobs SET status='pending',attempts=0,error_code=NULL,
 available_at=now(),updated_at=now() WHERE paper_id=$1 AND summary_type=$2 AND model_name=$3 AND status='failed'`,[paperId,type,model]);
 return findJob(paperId,type,model);
};

return {findJob, enqueue, paperExists, claim, expireExhausted, paperFile, withContentLock, readCache, complete, fail, retry};
}
export const {findJob, enqueue, paperExists, claim, expireExhausted, paperFile, withContentLock, readCache, complete, fail, retry} = createSummaryRepository();
