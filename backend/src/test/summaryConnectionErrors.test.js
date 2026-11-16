import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import pg from 'pg';
import { createSummaryRepository } from '../repositories/summary.repository.js';
import { observePgClient } from '../utils/pgClientErrors.js';
import { processSummaryJob } from '../services/summary.service.js';

function fakeClient() {
 const client = new EventEmitter();
 client.queries = [];
 client.query = async sql => { client.queries.push(sql); return { rows: [] }; };
 client.release = discard => { client.discarded = discard; };
 return client;
}

test('checked-out connection errors are observed once without throwing an unhandled event', () => {
 const client = fakeClient();
 const state = observePgClient(client);
 assert.equal(observePgClient(client), state);
 assert.equal(client.listenerCount('error'), 1);
 const error = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
 assert.doesNotThrow(() => client.emit('error', error));
 assert.equal(state.error, error);
});

test('a connection reset during AI work discards the socket and preserves a retryable error', async () => {
 const client = fakeClient();
 const repo = createSummaryRepository({ connect: async () => client });
 await assert.rejects(repo.withContentLock('paper-hash', async () => {
  client.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
  throw new Error('Client is not queryable');
 }), error => error.code === 'ECONNRESET' && error.retryable === true);
 assert.equal(client.discarded, true);
 assert.ok(!client.queries.some(sql => /ROLLBACK|pg_advisory_unlock/.test(sql)), 'broken sockets must not run cleanup queries');
});

test('healthy content locks use one bounded transaction and return their clients normally', async () => {
 const client = fakeClient();
 const repo = createSummaryRepository({ connect: async () => client });
 assert.equal(await repo.withContentLock('key', async () => 42), 42);
 assert.equal(client.queries[0], 'BEGIN');
 assert.ok(client.queries.some(sql => /pg_advisory_xact_lock/.test(sql)));
 assert.ok(client.queries.some(sql => /lock_timeout/.test(sql)));
 assert.equal(client.queries.at(-1), 'COMMIT');
 assert.equal(client.discarded, false);
});

test('connection errors while locking and before locking are retryable job failures', async () => {
 const client = fakeClient();
 client.query = async () => { throw Object.assign(new Error('reset'), { code: 'ECONNRESET' }); };
 const repo = createSummaryRepository({ connect: async () => client });
 await assert.rejects(repo.withContentLock('key', async () => assert.fail()), e => e.retryable);
 assert.equal(client.discarded, true);
 let failure;
 await processSummaryJob({ paper_id: 'paper' }, { repository: {
  paperFile: async () => { throw Object.assign(new Error('reset'), { code: 'ECONNRESET' }); },
  fail: async (...args) => { failure = args; },
 }});
 assert.equal(failure[1], 'DATABASE_CONNECTION_LOST');
 assert.equal(failure[2], true);
});

test('real PostgreSQL termination during a checked-out lock does not crash and a fresh connection works', async () => {
 const url = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
 assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname.includes('test'));
 const pool = new pg.Pool({ connectionString: url.href });
 const repo = createSummaryRepository(pool);
 try {
  await assert.rejects(repo.withContentLock('fr08-reset-regression', async client => {
   const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   const errorEvent = once(client, 'error');
   await pool.query('SELECT pg_terminate_backend($1)', [pid]);
   await errorEvent;
   throw new Error('Client is not queryable');
  }), error => error.retryable === true && ['57P01', 'ECONNRESET', '08006'].includes(error.code));
  assert.equal((await pool.query('SELECT 1 AS ready')).rows[0].ready, 1);
 } finally { await pool.end(); }
});

test('transaction-scoped content locks serialize clients and release automatically on commit', async () => {
 const url = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
 assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname.includes('test'));
 const pool = new pg.Pool({ connectionString: url.href });
 const repo = createSummaryRepository(pool);
 const events = [];
 try {
  const run = label => repo.withContentLock('fr08-pooled-lock-regression', async () => {
   events.push('enter ' + label);
   await new Promise(resolve => setTimeout(resolve, 30));
   events.push('exit ' + label);
  });
  await Promise.all([run('a'), run('b')]);
  assert.ok(
   JSON.stringify(events) === JSON.stringify(['enter a','exit a','enter b','exit b']) ||
   JSON.stringify(events) === JSON.stringify(['enter b','exit b','enter a','exit a'])
  );
  assert.equal((await pool.query('SELECT 1 AS ready')).rows[0].ready, 1);
 } finally { await pool.end(); }
});

test('lock timeouts roll back and retry without discarding a healthy connection', async () => {
 const client = fakeClient();
 const query = client.query;
 client.query = async sql => {
  if (sql.includes('pg_advisory_xact_lock')) throw Object.assign(new Error('lock timeout'), { code: '55P03' });
  return query(sql);
 };
 const repo = createSummaryRepository({ connect: async () => client });
 await assert.rejects(repo.withContentLock('busy-key', async () => assert.fail()), e => e.code === '55P03' && e.retryable);
 assert.equal(client.queries.at(-1), 'ROLLBACK');
 assert.equal(client.discarded, false);
});
