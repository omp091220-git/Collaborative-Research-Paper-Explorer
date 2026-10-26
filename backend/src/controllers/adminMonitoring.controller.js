import { getStorageMetrics } from "../services/storageMonitor.service.js";
import { getRedisQueueMetrics } from "../services/redisMonitor.service.js";
import { getGenAIMetrics, recordUsage } from "../services/genaiUsage.service.js";

/**
 * GET /api/admin/monitoring/overview
 * Consolidated system overview metrics for top-level dashboard summary cards.
 */
export const getOverview = async (req, res, next) => {
  try {
    const [storage, redis, genai] = await Promise.all([
      getStorageMetrics(),
      getRedisQueueMetrics(),
      getGenAIMetrics("30d"),
    ]);

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      overview: {
        storage: {
          totalUsedBytes: storage.usage.totalBytes,
          totalUsedFormatted: storage.usage.totalFormatted,
          quotaBytes: storage.quota.quotaBytes,
          quotaFormatted: storage.quota.quotaFormatted,
          remainingBytes: storage.usage.remainingBytes,
          remainingFormatted: storage.usage.remainingFormatted,
          utilizationPercent: storage.usage.utilizationPercent,
          paperCount: storage.usage.paperCount,
          status: storage.usage.status,
          isWarning: storage.usage.isWarning,
          isCritical: storage.usage.isCritical,
          quotaConfigured: storage.quota.configured,
        },
        redis: {
          configured: redis.configured,
          status: redis.status,
          connected: redis.connected,
          totalQueues: redis.summary.totalQueues,
          pendingJobs: redis.summary.pending,
          processingJobs: redis.summary.processing,
          failedJobs: redis.summary.failed,
          message: redis.message,
        },
        genai: {
          period: genai.period,
          totalTokens: genai.summary.totalTokens,
          promptTokens: genai.summary.promptTokens,
          completionTokens: genai.summary.completionTokens,
          totalCostUsd: genai.summary.totalCostUsd,
          totalRequests: genai.summary.totalRequests,
          actualReportedCount: genai.summary.actualReportedCount,
          estimatedCount: genai.summary.estimatedCount,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/admin/monitoring/storage
 * Detailed storage metrics, physical disk verification, paper-level breakdown, and top uploaders.
 */
export const getStorage = async (req, res, next) => {
  try {
    const storageMetrics = await getStorageMetrics();
    return res.status(200).json(storageMetrics);
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/admin/monitoring/redis
 * Detailed Redis queue metrics, connection health, and worker queue states.
 */
export const getRedis = async (req, res, next) => {
  try {
    const redisMetrics = await getRedisQueueMetrics();
    return res.status(200).json(redisMetrics);
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/admin/monitoring/genai
 * GenAI token consumption and API cost metrics with time-period filtering and model breakdown.
 */
export const getGenAI = async (req, res, next) => {
  try {
    const period = String(req.query.period || "30d").toLowerCase();
    const allowedPeriods = ["today", "7d", "30d", "all"];

    const selectedPeriod = allowedPeriods.includes(period) ? period : "30d";
    const genaiMetrics = await getGenAIMetrics(selectedPeriod);

    return res.status(200).json(genaiMetrics);
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/admin/monitoring/genai/record
 * Record a verified GenAI API request token usage record.
 */
export const recordGenAIUsage = async (req, res, next) => {
  try {
    const {
      paperId,
      provider,
      modelName,
      promptTokens,
      completionTokens,
      isEstimated,
      operationType,
      status,
    } = req.body;

    if (!modelName || typeof modelName !== "string" || !modelName.trim()) {
      return res.status(400).json({ error: "modelName is required." });
    }

    const pTokens = parseInt(promptTokens, 10);
    const cTokens = parseInt(completionTokens, 10);

    if (isNaN(pTokens) || pTokens < 0 || isNaN(cTokens) || cTokens < 0) {
      return res.status(400).json({
        error: "promptTokens and completionTokens must be non-negative integers.",
      });
    }

    const logRecord = await recordUsage({
      userId: req.user?.id || null,
      paperId: paperId || null,
      provider,
      modelName: modelName.trim(),
      promptTokens: pTokens,
      completionTokens: cTokens,
      isEstimated: Boolean(isEstimated),
      operationType: operationType || "summary",
      status: status || "success",
    });

    return res.status(201).json({
      message: "GenAI token usage recorded successfully.",
      record: logRecord,
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  getOverview,
  getStorage,
  getRedis,
  getGenAI,
  recordGenAIUsage,
};
