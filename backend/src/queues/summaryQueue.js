import { Queue } from "bullmq";
import { env } from "../config/env.js";

export const SUMMARY_QUEUE_NAME = "fr08-paper-summaries";
let queueInstance;

function redisConnectionOptions({ worker = false } = {}) {
  const parsed = new URL(env.redis.url);
  if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
    throw new Error("REDIS_URL must use redis:// or rediss://.");
  }
  const dbText = parsed.pathname.replace(/^\//, "");
  const options = {
    host: parsed.hostname,
    port: Number(parsed.port) || (parsed.protocol === "rediss:" ? 6380 : 6379),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: dbText && /^\d+$/.test(dbText) ? Number(dbText) : 0,
    maxRetriesPerRequest: worker ? null : 1,
    connectTimeout: 5000,
    enableReadyCheck: true,
  };
  if (parsed.protocol === "rediss:") options.tls = {};
  if (!worker) options.retryStrategy = (attempt) => (attempt >= 4 ? null : Math.min(attempt * 250, 1000));
  return options;
}

export function getSummaryQueue() {
  if (!queueInstance) {
    queueInstance = new Queue(SUMMARY_QUEUE_NAME, {
      connection: redisConnectionOptions(),
      defaultJobOptions: {
        attempts: 3, // initial attempt + two retries (NFR-07)
        backoff: { type: "exponential", delay: env.redis.retryDelayMs, jitter: 0.25 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 500 },
        removeOnFail: { age: 30 * 24 * 60 * 60, count: 1000 },
      },
    });
    queueInstance.on("error", (error) => {
      // Avoid an unhandled EventEmitter `error` event if Redis goes offline.
      console.error("FR-08 summary queue error:", error.message);
    });
  }
  return queueInstance;
}

export async function enqueueSummaryJob(data) {
  const queue = getSummaryQueue();
  try {
    return await queue.add("generate-paper-summary", data, {
      jobId: data.jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: env.redis.retryDelayMs, jitter: 0.25 },
      removeOnComplete: { age: 7 * 24 * 60 * 60, count: 500 },
      removeOnFail: { age: 30 * 24 * 60 * 60, count: 1000 },
    });
  } catch (error) {
    await closeSummaryQueue();
    throw error;
  }
}

export async function closeSummaryQueue() {
  const queue = queueInstance;
  queueInstance = undefined;
  if (queue) await queue.close().catch(() => {});
}

export { redisConnectionOptions };
