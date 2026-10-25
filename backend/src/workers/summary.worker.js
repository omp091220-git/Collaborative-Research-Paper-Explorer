import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, UnrecoverableError } from "bullmq";
import pool from "../config/database.js";
import { env } from "../config/env.js";
import { SUMMARY_QUEUE_NAME, getSummaryQueue, closeSummaryQueue, redisConnectionOptions } from "../queues/summaryQueue.js";
import { processSummaryJob } from "../services/summary/summaryJob.service.js";

let worker;
let workerConnection;

/**
 * Recover DB jobs whose enqueue failed between the durable DB insert and Redis,
 * or whose worker died after marking a job processing. Active/waiting Redis jobs
 * are left alone; terminal/orphaned Redis jobs are safely re-enqueued by ID.
 */
export async function recoverQueuedSummaryJobs({ db = pool, queueProvider = getSummaryQueue } = {}) {
  const result = await db.query(
    `SELECT id, paper_id, requested_by, source_sha256, model_name, summary_type, status
       FROM paper_summary_jobs WHERE status IN ('queued', 'processing')
       ORDER BY created_at ASC LIMIT 500`
  );
  const queue = queueProvider();
  let recovered = 0;
  const liveStates = new Set(['waiting', 'active', 'delayed', 'waiting-children', 'prioritized', 'paused']);

  for (const row of result.rows) {
    const existing = await queue.getJob(row.id);
    if (existing) {
      const state = await existing.getState();
      if (liveStates.has(state)) continue;
      // Remove terminal leftovers so BullMQ can accept a new job with the same ID.
      if (state === 'failed' || state === 'completed') {
        await existing.remove();
      } else if (state !== 'unknown') {
        continue;
      }
    }

    if (row.status === 'processing') {
      await db.query(
        `UPDATE paper_summary_jobs SET status = 'queued', updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND status = 'processing'`,
        [row.id]
      );
    }

    await queue.add('generate-paper-summary', {
      jobId: row.id,
      paperId: row.paper_id,
      requestedBy: row.requested_by,
      sourceSha256: row.source_sha256,
      modelName: row.model_name,
      summaryType: row.summary_type,
    }, {
      jobId: row.id,
      attempts: 3,
      backoff: { type: 'exponential', delay: env.redis.retryDelayMs, jitter: 0.25 },
      removeOnComplete: { age: 7 * 24 * 60 * 60, count: 500 },
      removeOnFail: { age: 30 * 24 * 60 * 60, count: 1000 },
    });
    recovered += 1;
  }
  return recovered;
}

export async function startSummaryWorker() {
  if (worker) return worker;
  workerConnection = redisConnectionOptions({ worker: true });

  worker = new Worker(
    SUMMARY_QUEUE_NAME,
    async (job) => {
      try {
        return await processSummaryJob(job);
      } catch (error) {
        if (error?.retryable === false) {
          throw new UnrecoverableError(error.publicMessage || error.message || "Summary job cannot be retried.");
        }
        throw error instanceof Error ? error : new Error("Unknown summarization failure.");
      }
    },
    {
      connection: workerConnection,
      concurrency: env.redis.workerConcurrency,
      lockDuration: 120000,
      stalledInterval: 30000,
      maxStalledCount: 1,
    }
  );

  worker.on("completed", (job) => console.log(`FR-08 summary job ${job.id} completed.`));
  worker.on("failed", (job, error) => {
    if (job) console.error(`FR-08 summary job ${job.id} failed (attempt ${job.attemptsMade}): ${error.message}`);
  });
  worker.on("error", (error) => console.error("FR-08 summary worker error:", error.message));

  await worker.waitUntilReady();
  const recovered = await recoverQueuedSummaryJobs();
  if (recovered) console.log(`Recovered ${recovered} queued FR-08 summary job(s).`);
  console.log(`FR-08 summary worker ready (concurrency ${env.redis.workerConcurrency}).`);
  return worker;
}

export async function stopSummaryWorker() {
  if (worker) {
    await worker.close();
    worker = undefined;
  }
  workerConnection = undefined;
  await closeSummaryQueue();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startSummaryWorker().catch((error) => {
    console.error("FR-08 worker startup failed:", error.message);
    process.exitCode = 1;
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received. Stopping FR-08 worker...`);
    try {
      await stopSummaryWorker();
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error("FR-08 worker shutdown failed:", error.message);
      process.exit(1);
    }
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}
