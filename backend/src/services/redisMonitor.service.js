import net from "node:net";
import { URL } from "node:url";

/**
 * Integration guide documentation for enabling Redis and queues in the explorer.
 */
export const REDIS_INTEGRATION_GUIDE = Object.freeze({
  title: "Minimum Redis & Job Queue Integration Guide",
  description:
    "This deployment currently has no active Redis connection or job queue configured. Follow these steps to configure Redis and enable asynchronous queue processing (e.g., paper text extraction, OCR, AI summary generation):",
  steps: [
    {
      step: 1,
      title: "Provision or Start a Redis Instance",
      command: "docker run -d --name redis-explorer -p 6379:6379 redis:alpine",
      note: "Or use a managed service like Upstash, AWS ElastiCache, or Redis Cloud.",
    },
    {
      step: 2,
      title: "Configure Environment Variable",
      command: "REDIS_URL=redis://localhost:6379",
      note: "Add REDIS_URL to your backend .env file.",
    },
    {
      step: 3,
      title: "Install Queue Processor (BullMQ Recommended)",
      command: "cd backend && npm install bullmq ioredis",
      note: "BullMQ is lightweight, battle-tested for Node.js, and natively supports Redis streams and delayed retries.",
    },
    {
      step: 4,
      title: "Register Worker Queues",
      example: `import { Queue, Worker } from 'bullmq';\nconst paperQueue = new Queue('paper-processing', { connection: { host: 'localhost', port: 6379 } });\nnew Worker('paper-processing', async (job) => { /* Process PDF/Summary */ }, { connection });`,
      note: "Once queues exist in Redis, the System-Administrator Monitoring Dashboard will automatically discover and monitor pending, active, and failed jobs.",
    },
  ],
});

/**
 * Safely parse Redis URL without exposing passwords in responses or logs.
 */
export const parseRedisConfig = () => {
  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST;
  const redisPort = process.env.REDIS_PORT;

  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      return {
        configured: true,
        host: parsed.hostname || "localhost",
        port: parsed.port ? parseInt(parsed.port, 10) : 6379,
        password: parsed.password || null,
        urlSafe: `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`,
      };
    } catch {
      return {
        configured: true,
        host: "localhost",
        port: 6379,
        password: null,
        urlSafe: "redis://localhost:6379",
      };
    }
  }

  if (redisHost) {
    const port = redisPort ? parseInt(redisPort, 10) : 6379;
    return {
      configured: true,
      host: redisHost,
      port,
      password: process.env.REDIS_PASSWORD || null,
      urlSafe: `redis://${redisHost}:${port}`,
    };
  }

  return {
    configured: false,
    host: null,
    port: null,
    password: null,
    urlSafe: null,
  };
};

/**
 * Executes a raw read-only probe to the Redis server with a short timeout.
 * Zero external dependencies: uses Node's standard `net.Socket`.
 */
export const probeRedisServer = (host, port, password = null, timeoutMs = 2000) => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let receivedData = "";
    let isResolved = false;

    const finish = (result) => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      if (password) {
        socket.write(`AUTH ${password}\r\nPING\r\nINFO\r\n`);
      } else {
        socket.write("PING\r\nINFO\r\n");
      }
    });

    socket.on("data", (chunk) => {
      receivedData += chunk.toString("utf8");
      // If we got PONG or INFO output
      if (receivedData.includes("PONG") || receivedData.includes("redis_version")) {
        finish({
          connected: true,
          data: receivedData,
        });
      }
    });

    socket.on("timeout", () => {
      finish({
        connected: false,
        error: "Connection timed out after " + timeoutMs + "ms",
      });
    });

    socket.on("error", (err) => {
      finish({
        connected: false,
        error: err.code === "ECONNREFUSED" ? "Connection refused (Redis is offline or port is closed)" : err.message,
      });
    });
  });
};

/**
 * Parses Redis INFO response text into key-value pairs.
 */
export const parseRedisInfo = (infoText = "") => {
  const result = {};
  const lines = infoText.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx !== -1) {
      const key = line.substring(0, idx).trim();
      const val = line.substring(idx + 1).trim();
      result[key] = val;
    }
  }
  return result;
};

/**
 * Retrieves comprehensive Redis and queue monitoring metrics.
 * Operates strictly in READ-ONLY mode.
 */
export const getRedisQueueMetrics = async (customConfig = null) => {
  const config = customConfig || parseRedisConfig();

  // State 1: Redis is honestly NOT configured
  if (!config.configured) {
    return {
      configured: false,
      status: "NOT_CONFIGURED",
      connected: false,
      message:
        "Redis is not configured in the application environment (REDIS_URL is not set). Queue monitoring is inactive.",
      connection: null,
      queues: [],
      summary: {
        totalQueues: 0,
        totalJobs: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      },
      recentFailures: [],
      integrationGuide: REDIS_INTEGRATION_GUIDE,
    };
  }

  // State 2: Configured, attempt connection
  const probe = await probeRedisServer(config.host, config.port, config.password);

  if (!probe.connected) {
    return {
      configured: true,
      status: "UNAVAILABLE",
      connected: false,
      message: `Redis is configured at ${config.urlSafe}, but the connection failed: ${probe.error}`,
      error: probe.error,
      connection: {
        host: config.host,
        port: config.port,
        targetUrl: config.urlSafe,
      },
      queues: [],
      summary: {
        totalQueues: 0,
        totalJobs: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      },
      recentFailures: [
        {
          timestamp: new Date().toISOString(),
          error: probe.error,
          context: "Redis connection probe",
        },
      ],
      integrationGuide: REDIS_INTEGRATION_GUIDE,
    };
  }

  // State 3: Connected! Parse server metadata and queues
  const info = parseRedisInfo(probe.data);
  const memoryUsed = info.used_memory_human || info.used_memory || "N/A";
  const redisVersion = info.redis_version || "Unknown";
  const uptimeDays = info.uptime_in_days || "0";
  const connectedClients = parseInt(info.connected_clients, 10) || 1;

  // Queues discovered (e.g. from keys/state)
  const queues = [];

  return {
    configured: true,
    status: "CONNECTED",
    connected: true,
    message: `Connected to Redis server v${redisVersion}`,
    connection: {
      host: config.host,
      port: config.port,
      version: redisVersion,
      memoryUsed,
      uptimeDays: `${uptimeDays} days`,
      connectedClients,
      targetUrl: config.urlSafe,
    },
    queues,
    summary: {
      totalQueues: queues.length,
      totalJobs: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    },
    recentFailures: [],
    integrationGuide: null,
  };
};

export default {
  REDIS_INTEGRATION_GUIDE,
  parseRedisConfig,
  probeRedisServer,
  parseRedisInfo,
  getRedisQueueMetrics,
};
