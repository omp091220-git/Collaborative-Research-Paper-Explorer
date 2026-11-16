import defaultPool from '../config/database.js';
import { observePgClient, isPgConnectionError } from '../utils/pgClientErrors.js';
import { summaryRetryDelay } from '../utils/summaryRetry.js';

export function createSummaryRepository(pool = defaultPool) {

const findJob = async (paperId, type, model) => (await pool.query(
  `SELECT id, paper_id, summary_type, model_name, status, attempts, sections, error_code, updated_at, available_at
   FROM structured_summary_jobs WHERE paper_id=$1 AND summary_type=$2 AND model_name=$3`, [paperId,type,model])).rows[0] || null;

const enqueue = async (paperId,type,model) => {
  await pool.query(`INSERT INTO structured_summary_jobs(paper_id,summary_type,model_name)
    VALUES($1,$2,$3) ON CONFLICT(paper_id,summary_type,model_name) DO NOTHING`,[paperId,type,model]);
  return findJob(paperId,type,model);
};

// Reserve requests on the receiving server before another development server can
// claim them from the shared Neon queue. The lease/fencing contract is unchanged.
const reserveForRequest = async (paperId,type,model) => (await pool.query(`
 INSERT INTO structured_summary_jobs(paper_id,summary_type,model_name,status,attempts,lease_token,lease_until)
 VALUES($1,$2,$3,'processing',1,gen_random_uuid(),now()+interval '5 minutes')
 ON CONFLICT(paper_id,summary_type,model_name) DO UPDATE SET
 status='processing',attempts=CASE WHEN structured_summary_jobs.status='failed' THEN 1 ELSE structured_summary_jobs.attempts+1 END,
 lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',error_code=NULL,updated_at=now()
 WHERE structured_summary_jobs.status='failed' OR
 (structured_summary_jobs.status='pending' AND structured_summary_jobs.available_at<=now()) OR
 (structured_summary_jobs.status='processing' AND structured_summary_jobs.lease_until<now() AND structured_summary_jobs.attempts<3)
 RETURNING *`,[paperId,type,model])).rows[0];

const claim = async (model = null) => (await pool.query(`WITH candidate AS (
 SELECT id FROM structured_summary_jobs
 WHERE ($1::text IS NULL OR model_name=$1) AND attempts < 3 AND ((status='pending' AND available_at <= now()) OR (status='processing' AND lease_until < now()))
 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE structured_summary_jobs j SET status='processing',attempts=attempts+1,
 lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
 FROM candidate c WHERE j.id=c.id RETURNING j.*`,[model])).rows[0];
const expireExhausted = async () => pool.query(`UPDATE structured_summary_jobs
 SET status='failed',error_code='WORKER_INTERRUPTED',updated_at=now()
 WHERE status='processing' AND lease_until < now() AND attempts >= 3`);
const paperFile = async (id) => (await pool.query('SELECT file_path, arxiv_id FROM papers WHERE id=$1',[id])).rows[0];
const paperExists = async (id) => (await pool.query('SELECT id FROM papers WHERE id=$1',[id])).rows.length > 0;

async function withContentLock(key, callback) {
 const client = await pool.connect();
 const state = observePgClient(client);
 let inTransaction = false;
 let result;
 let failure;
 try {
  await client.query('BEGIN');
  inTransaction = true;
  await client.query("SET LOCAL lock_timeout = '60s'");
  await client.query("SET LOCAL statement_timeout = '90s'");
  // A transaction-scoped lock pins a pooled Neon connection for this work.
  // Session-level advisory locks are unsafe with transaction-mode poolers.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['fr08-summary-v2:' + key]);
  if (state.error) throw state.error;
  result = await callback(client);
  if (state.error) throw state.error;
  await client.query('COMMIT');
  inTransaction = false;
 } catch (error) {
  failure = state.error || error;
 } finally {
  if (inTransaction && !state.error) {
   try { await client.query('ROLLBACK'); }
   catch (error) { failure = state.error || failure || error; }
  }
  client.release(Boolean(state.error || isPgConnectionError(failure)));
 }
 if (failure) {
  if (isPgConnectionError(failure) || ['55P03', '57014'].includes(failure.code)) failure.retryable = true;
  throw failure;
 }
 return result;
}
const readCache = async (client,hash,job) => (await client.query(
 `SELECT sections FROM structured_summary_cache WHERE content_hash=$1 AND summary_type=$2 AND model_name=$3`,
 [hash,job.summary_type,job.model_name])).rows[0]?.sections;

// Must run inside withContentLock's transaction; never commit its caller's lock.
async function complete(client,job,hash,sections) {
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
}

const fail = async (job,code,retryable,retryAfterMs=0) => pool.query(`UPDATE structured_summary_jobs
 SET status=CASE WHEN $3 AND attempts < 3 THEN 'pending' ELSE 'failed' END,
 error_code=$4,available_at=now()+ ($5::double precision * interval '1 millisecond'),lease_until=NULL,updated_at=now()
 WHERE id=$1 AND lease_token=$2 AND status='processing'`,[job.id,job.lease_token,retryable,code,summaryRetryDelay(job.attempts,retryAfterMs)]);

const retry = async (paperId,type,model) => {
 await pool.query(`UPDATE structured_summary_jobs SET status='pending',attempts=0,error_code=NULL,
 available_at=now(),updated_at=now() WHERE paper_id=$1 AND summary_type=$2 AND model_name=$3 AND status='failed'`,[paperId,type,model]);
 return findJob(paperId,type,model);
};

return {findJob, enqueue, reserveForRequest, paperExists, claim, expireExhausted, paperFile, withContentLock, readCache, complete, fail, retry};
}
export const {findJob, enqueue, reserveForRequest, paperExists, claim, expireExhausted, paperFile, withContentLock, readCache, complete, fail, retry} = createSummaryRepository();
