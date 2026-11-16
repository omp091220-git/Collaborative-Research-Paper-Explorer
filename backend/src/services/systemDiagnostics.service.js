import os from "node:os";
import pool from "../config/database.js";
import { formatBytes } from "./storageMonitor.service.js";

/**
 * System Diagnostics and Runtime Health Service
 * Provides process-level observability, Node memory telemetry,
 * and database connection pool statistics for system administrators.
 */

/**
 * Returns formatted operational system uptime.
 * @param {number} seconds
 * @returns {string} Human-readable uptime
 */
export const formatUptime = (seconds = 0) => {
  const sec = Math.floor(seconds);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remainingSecs = sec % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${remainingSecs}s`);

  return parts.join(" ");
};

/**
 * Collects runtime node process metrics.
 * @returns {object} Process memory and CPU telemetry
 */
export const getProcessMetrics = () => {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const uptimeSeconds = process.uptime();

  return {
    uptimeSeconds,
    uptimeFormatted: formatUptime(uptimeSeconds),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    memory: {
      rss: memory.rss,
      rssFormatted: formatBytes(memory.rss),
      heapTotal: memory.heapTotal,
      heapTotalFormatted: formatBytes(memory.heapTotal),
      heapUsed: memory.heapUsed,
      heapUsedFormatted: formatBytes(memory.heapUsed),
      external: memory.external,
      externalFormatted: formatBytes(memory.external),
      heapUtilizationPercent: Number(((memory.heapUsed / memory.heapTotal) * 100).toFixed(2)),
    },
    cpu: {
      userMicroseconds: cpu.user,
      systemMicroseconds: cpu.system,
    },
  };
};

/**
 * Collects operating system environment statistics.
 * @returns {object} Host system telemetry
 */
export const getHostMetrics = () => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    hostname: os.hostname(),
    osType: os.type(),
    osRelease: os.release(),
    cpuCores: os.cpus().length,
    loadAverage: os.loadavg ? os.loadavg() : [0, 0, 0],
    memory: {
      totalBytes: totalMem,
      totalFormatted: formatBytes(totalMem),
      freeBytes: freeMem,
      freeFormatted: formatBytes(freeMem),
      usedBytes: usedMem,
      usedFormatted: formatBytes(usedMem),
      utilizationPercent: Number(((usedMem / totalMem) * 100).toFixed(2)),
    },
  };
};

/**
 * Collects PostgreSQL connection pool telemetry.
 * @returns {Promise<object>} Database connection pool health
 */
export const getDatabasePoolMetrics = async () => {
  const totalCount = pool.totalCount ?? 0;
  const idleCount = pool.idleCount ?? 0;
  const waitingCount = pool.waitingCount ?? 0;
  const activeCount = Math.max(0, totalCount - idleCount);

  let dbPingMs = null;
  let dbStatus = "HEALTHY";

  try {
    const start = Date.now();
    await pool.query("SELECT 1;");
    dbPingMs = Date.now() - start;
  } catch (err) {
    dbStatus = "DEGRADED";
  }

  return {
    status: dbStatus,
    pingLatencyMs: dbPingMs,
    pool: {
      totalConnections: totalCount,
      activeConnections: activeCount,
      idleConnections: idleCount,
      waitingClients: waitingCount,
    },
  };
};

/**
 * Aggregates complete system runtime diagnostics for administration.
 * @returns {Promise<object>} Complete diagnostic snapshot
 */
export const getSystemDiagnostics = async () => {
  const [dbHealth] = await Promise.all([getDatabasePoolMetrics()]);

  return {
    timestamp: new Date().toISOString(),
    process: getProcessMetrics(),
    host: getHostMetrics(),
    database: dbHealth,
  };
};
