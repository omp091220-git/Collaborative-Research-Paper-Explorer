import pool from "../config/database.js";
import { getModelPricing, calculateCostUsd, normalizeModelName, MODEL_PRICING } from "../config/pricing.js";

/**
 * Validates and records a GenAI API usage log into PostgreSQL.
 */
export const recordUsage = async ({
  userId = null,
  paperId = null,
  provider = null,
  modelName = "gemini-1.5-flash",
  promptTokens = 0,
  completionTokens = 0,
  isEstimated = false,
  operationType = "summary",
  status = "success",
} = {}) => {
  const normModel = normalizeModelName(modelName);
  const pricing = getModelPricing(normModel);
  const resolvedProvider = provider || pricing.provider || "unknown";

  const pTokens = Math.max(0, parseInt(promptTokens, 10) || 0);
  const cTokens = Math.max(0, parseInt(completionTokens, 10) || 0);
  const totalTokens = pTokens + cTokens;

  const estimatedCost = calculateCostUsd(normModel, pTokens, cTokens);

  const query = `
    INSERT INTO genai_usage_logs (
      user_id, paper_id, provider, model_name,
      prompt_tokens, completion_tokens, total_tokens,
      is_estimated, estimated_cost_usd, operation_type, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *;
  `;

  const values = [
    userId || null,
    paperId || null,
    resolvedProvider,
    normModel,
    pTokens,
    cTokens,
    totalTokens,
    Boolean(isEstimated),
    estimatedCost,
    operationType || "summary",
    status || "success",
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
};

/**
 * Builds the SQL time condition for period filtering.
 */
const getPeriodFilterClause = (period) => {
  switch (period?.toLowerCase()) {
    case "today":
      return "created_at >= CURRENT_DATE";
    case "7d":
    case "7days":
      return "created_at >= (CURRENT_TIMESTAMP - INTERVAL '7 days')";
    case "30d":
    case "30days":
      return "created_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days')";
    case "all":
      return "1=1";
    default:
      return "created_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days')";
  }
};

/**
 * Retrieves comprehensive GenAI monitoring metrics for the specified period.
 */
export const getGenAIMetrics = async (period = "30d") => {
  const timeClause = getPeriodFilterClause(period);

  // 1. Overall Summary Aggregates
  const summaryQuery = `
    SELECT
      COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
      COALESCE(SUM(prompt_tokens), 0)::BIGINT AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0)::BIGINT AS completion_tokens,
      COALESCE(SUM(estimated_cost_usd), 0)::NUMERIC AS total_cost_usd,
      COUNT(*)::INT AS total_requests,
      COALESCE(SUM(CASE WHEN is_estimated = FALSE THEN 1 ELSE 0 END), 0)::INT AS actual_reported_count,
      COALESCE(SUM(CASE WHEN is_estimated = TRUE THEN 1 ELSE 0 END), 0)::INT AS estimated_count
    FROM genai_usage_logs
    WHERE ${timeClause} AND status = 'success';
  `;

  // 2. Model Breakdown
  const modelQuery = `
    SELECT
      model_name,
      provider,
      COUNT(*)::INT AS request_count,
      COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
      COALESCE(SUM(prompt_tokens), 0)::BIGINT AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0)::BIGINT AS completion_tokens,
      COALESCE(SUM(estimated_cost_usd), 0)::NUMERIC AS total_cost_usd
    FROM genai_usage_logs
    WHERE ${timeClause} AND status = 'success'
    GROUP BY model_name, provider
    ORDER BY total_tokens DESC;
  `;

  // 3. Provider Breakdown
  const providerQuery = `
    SELECT
      provider,
      COUNT(*)::INT AS request_count,
      COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
      COALESCE(SUM(estimated_cost_usd), 0)::NUMERIC AS total_cost_usd
    FROM genai_usage_logs
    WHERE ${timeClause} AND status = 'success'
    GROUP BY provider
    ORDER BY total_tokens DESC;
  `;

  // 4. Time Series Trend (Daily)
  const timeSeriesQuery = `
    SELECT
      TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS date,
      COALESCE(SUM(prompt_tokens), 0)::BIGINT AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0)::BIGINT AS completion_tokens,
      COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
      COALESCE(SUM(estimated_cost_usd), 0)::NUMERIC AS cost_usd,
      COUNT(*)::INT AS request_count
    FROM genai_usage_logs
    WHERE ${timeClause} AND status = 'success'
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) ASC;
  `;

  // 5. Recent Usage Records
  const recentLogsQuery = `
    SELECT
      g.id,
      g.model_name,
      g.provider,
      g.prompt_tokens,
      g.completion_tokens,
      g.total_tokens,
      g.is_estimated,
      g.estimated_cost_usd,
      g.operation_type,
      g.status,
      g.created_at,
      p.title AS paper_title,
      u.full_name AS user_name,
      u.email AS user_email
    FROM genai_usage_logs g
    LEFT JOIN papers p ON g.paper_id = p.id
    LEFT JOIN users u ON g.user_id = u.id
    ORDER BY g.created_at DESC
    LIMIT 50;
  `;

  const [summaryRes, modelRes, providerRes, timeSeriesRes, recentLogsRes] =
    await Promise.all([
      pool.query(summaryQuery),
      pool.query(modelQuery),
      pool.query(providerQuery),
      pool.query(timeSeriesQuery),
      pool.query(recentLogsQuery),
    ]);

  const summaryRow = summaryRes.rows[0] || {};

  return {
    period: period?.toLowerCase() || "30d",
    summary: {
      totalTokens: Number(summaryRow.total_tokens || 0),
      promptTokens: Number(summaryRow.prompt_tokens || 0),
      completionTokens: Number(summaryRow.completion_tokens || 0),
      totalCostUsd: Number(parseFloat(summaryRow.total_cost_usd || 0).toFixed(6)),
      totalRequests: Number(summaryRow.total_requests || 0),
      actualReportedCount: Number(summaryRow.actual_reported_count || 0),
      estimatedCount: Number(summaryRow.estimated_count || 0),
    },
    byModel: modelRes.rows.map((row) => ({
      modelName: row.model_name,
      provider: row.provider,
      requestCount: Number(row.request_count || 0),
      totalTokens: Number(row.total_tokens || 0),
      promptTokens: Number(row.prompt_tokens || 0),
      completionTokens: Number(row.completion_tokens || 0),
      totalCostUsd: Number(parseFloat(row.total_cost_usd || 0).toFixed(6)),
    })),
    byProvider: providerRes.rows.map((row) => ({
      provider: row.provider,
      requestCount: Number(row.request_count || 0),
      totalTokens: Number(row.total_tokens || 0),
      totalCostUsd: Number(parseFloat(row.total_cost_usd || 0).toFixed(6)),
    })),
    timeSeries: timeSeriesRes.rows.map((row) => ({
      date: row.date,
      promptTokens: Number(row.prompt_tokens || 0),
      completionTokens: Number(row.completion_tokens || 0),
      totalTokens: Number(row.total_tokens || 0),
      costUsd: Number(parseFloat(row.cost_usd || 0).toFixed(6)),
      requestCount: Number(row.request_count || 0),
    })),
    recentLogs: recentLogsRes.rows,
    pricingCatalog: MODEL_PRICING,
  };
};

export default {
  recordUsage,
  getGenAIMetrics,
};
