import pool from "../config/database.js";
import { formatBytes } from "./storageMonitor.service.js";

/**
 * Storage Forecasting and Capacity Planning Service
 * Computes historical upload trajectories, calculates daily burn rates,
 * and projects estimated time to quota exhaustion.
 */

/**
 * Calculates linear projection of days until quota limit is reached.
 * @param {number} totalUsedBytes Current storage utilized
 * @param {number} quotaBytes Total available storage quota
 * @param {number} dailyGrowthBytes Average storage growth per 24 hours
 * @returns {object} Forecasting projection data
 */
export const calculateQuotaExhaustion = (totalUsedBytes, quotaBytes, dailyGrowthBytes) => {
  if (!quotaBytes || quotaBytes <= 0) {
    return {
      status: "UNCONFIGURED",
      daysToExhaustion: null,
      burnRateFormatted: formatBytes(dailyGrowthBytes) + "/day",
      estimatedExhaustionDate: null,
      recommendation: "Configure STORAGE_QUOTA_BYTES or STORAGE_QUOTA_MB in deployment environment.",
    };
  }

  const remainingBytes = Math.max(0, quotaBytes - totalUsedBytes);

  if (remainingBytes === 0) {
    return {
      status: "EXHAUSTED",
      daysToExhaustion: 0,
      burnRateFormatted: formatBytes(dailyGrowthBytes) + "/day",
      estimatedExhaustionDate: new Date().toISOString(),
      recommendation: "Quota full! Expansion or archiving immediately required.",
    };
  }

  if (!dailyGrowthBytes || dailyGrowthBytes <= 0) {
    return {
      status: "STABLE",
      daysToExhaustion: null,
      burnRateFormatted: "0 B/day",
      estimatedExhaustionDate: null,
      recommendation: "Storage utilization is stable. No immediate capacity expansion needed.",
    };
  }

  const daysRemaining = Math.floor(remainingBytes / dailyGrowthBytes);
  const targetDate = new Date(Date.now() + daysRemaining * 86400000);

  let status = "SAFE";
  let recommendation = "Storage trajectory is within healthy margins.";

  if (daysRemaining <= 7) {
    status = "CRITICAL_CAPACITY_RISK";
    recommendation = "Quota exhaustion projected within 7 days. Add disk storage or enforce quotas immediately.";
  } else if (daysRemaining <= 30) {
    status = "ELEVATED_CAPACITY_WARNING";
    recommendation = "Quota projected to fill within 30 days. Plan capacity expansion.";
  }

  return {
    status,
    daysToExhaustion: daysRemaining,
    burnRateFormatted: formatBytes(dailyGrowthBytes) + "/day",
    estimatedExhaustionDate: targetDate.toISOString(),
    recommendation,
  };
};

/**
 * Generates an end-to-end capacity forecast based on recent database upload activity.
 * @param {number} lookbackDays Window to evaluate daily growth rate (default: 30)
 * @returns {Promise<object>} Comprehensive capacity forecast
 */
export const getStorageForecast = async (lookbackDays = 30) => {
  const windowDays = Math.max(7, Math.min(365, parseInt(lookbackDays, 10) || 30));

  // Query cumulative uploads within the lookback window
  const growthQuery = `
    SELECT
      COUNT(id)::INT AS new_papers_in_window,
      COALESCE(SUM(file_size_bytes), 0)::BIGINT AS bytes_in_window
    FROM papers
    WHERE uploaded_at >= (CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL);
  `;

  // Query global totals
  const totalQuery = `
    SELECT
      COUNT(id)::INT AS total_papers,
      COALESCE(SUM(file_size_bytes), 0)::BIGINT AS total_bytes
    FROM papers;
  `;

  const [growthRes, totalRes] = await Promise.all([
    pool.query(growthQuery, [windowDays]),
    pool.query(totalQuery),
  ]);

  const windowRow = growthRes.rows[0] || {};
  const totalRow = totalRes.rows[0] || {};

  const totalBytes = Number(totalRow.total_bytes || 0);
  const totalPapers = Number(totalRow.total_papers || 0);
  const bytesInWindow = Number(windowRow.bytes_in_window || 0);
  const papersInWindow = Number(windowRow.new_papers_in_window || 0);

  // Daily growth calculation
  const dailyGrowthBytes = Math.round(bytesInWindow / windowDays);
  const dailyNewPapers = Number((papersInWindow / windowDays).toFixed(2));

  // Resolve quota
  let quotaBytes = null;
  if (process.env.STORAGE_QUOTA_BYTES && !isNaN(parseInt(process.env.STORAGE_QUOTA_BYTES, 10))) {
    quotaBytes = parseInt(process.env.STORAGE_QUOTA_BYTES, 10);
  } else if (process.env.STORAGE_QUOTA_MB && !isNaN(parseInt(process.env.STORAGE_QUOTA_MB, 10))) {
    quotaBytes = parseInt(process.env.STORAGE_QUOTA_MB, 10) * 1024 * 1024;
  }

  const exhaustion = calculateQuotaExhaustion(totalBytes, quotaBytes, dailyGrowthBytes);

  return {
    timestamp: new Date().toISOString(),
    lookbackDays: windowDays,
    metrics: {
      totalStoredBytes: totalBytes,
      totalStoredFormatted: formatBytes(totalBytes),
      totalPapersCount: totalPapers,
      windowNewPapers: papersInWindow,
      windowNewBytes: bytesInWindow,
      windowNewFormatted: formatBytes(bytesInWindow),
      dailyBurnRateBytes: dailyGrowthBytes,
      dailyBurnRateFormatted: exhaustion.burnRateFormatted,
      dailyNewPapersRate: dailyNewPapers,
    },
    quota: {
      configured: quotaBytes !== null && quotaBytes > 0,
      quotaBytes,
      quotaFormatted: quotaBytes ? formatBytes(quotaBytes) : "Unmetered",
    },
    forecast: exhaustion,
  };
};
