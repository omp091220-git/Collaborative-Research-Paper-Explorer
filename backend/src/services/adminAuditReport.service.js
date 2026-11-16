import pool from "../config/database.js";
import { formatBytes } from "./storageMonitor.service.js";

/**
 * Admin Audit and Expenditure Report Service
 * Aggregates GenAI cost models, token expenditure audit trails,
 * and formats compliance-ready exports (CSV / JSON).
 */

/**
 * Escapes fields for CSV compliance according to RFC 4180.
 * @param {any} val
 * @returns {string} Escaped CSV cell value
 */
export const escapeCsvCell = (val) => {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
};

/**
 * Generates an administrative GenAI usage audit summary.
 * @param {string} period '7d' | '30d' | '90d' | 'all'
 * @returns {Promise<object>} Usage audit summary
 */
export const getGenAiAuditData = async (period = "30d") => {
  let timeClause = "TRUE";
  if (period === "7d") {
    timeClause = "g.created_at >= (CURRENT_TIMESTAMP - INTERVAL '7 days')";
  } else if (period === "30d") {
    timeClause = "g.created_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days')";
  } else if (period === "90d") {
    timeClause = "g.created_at >= (CURRENT_TIMESTAMP - INTERVAL '90 days')";
  }

  const query = `
    SELECT
      g.id AS log_id,
      g.created_at,
      COALESCE(u.full_name, 'System Background Worker') AS user_name,
      COALESCE(u.email, 'system@platform.internal') AS user_email,
      COALESCE(p.title, 'General Operation') AS paper_title,
      g.provider,
      g.model_name,
      g.operation_type,
      g.prompt_tokens,
      g.completion_tokens,
      g.total_tokens,
      g.is_estimated,
      g.estimated_cost_usd,
      g.status
    FROM genai_usage_logs g
    LEFT JOIN users u ON g.user_id = u.id
    LEFT JOIN papers p ON g.paper_id = p.id
    WHERE ${timeClause}
    ORDER BY g.created_at DESC
    LIMIT 1000;
  `;

  const result = await pool.query(query);
  return result.rows;
};

/**
 * Converts audit data into RFC-4180 standard CSV text.
 * @param {Array<object>} rows
 * @returns {string} CSV text
 */
export const convertAuditRowsToCsv = (rows = []) => {
  const headers = [
    "Log ID",
    "Timestamp",
    "User Name",
    "User Email",
    "Paper Title",
    "Provider",
    "Model Name",
    "Operation Type",
    "Prompt Tokens",
    "Completion Tokens",
    "Total Tokens",
    "Is Estimated",
    "Estimated Cost (USD)",
    "Status",
  ];

  const headerLine = headers.map(escapeCsvCell).join(",");
  const dataLines = rows.map((r) => {
    return [
      r.log_id,
      r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      r.user_name,
      r.user_email,
      r.paper_title,
      r.provider,
      r.model_name,
      r.operation_type,
      r.prompt_tokens,
      r.completion_tokens,
      r.total_tokens,
      r.is_estimated ? "TRUE" : "FALSE",
      Number(r.estimated_cost_usd || 0).toFixed(6),
      r.status,
    ]
      .map(escapeCsvCell)
      .join(",");
  });

  return [headerLine, ...dataLines].join("\r\n");
};

/**
 * Produces aggregated cost statistics by model and operation.
 * @param {Array<object>} rows
 * @returns {object} Aggregation summary
 */
export const summarizeAuditRows = (rows = []) => {
  let totalCostUsd = 0;
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  const byModel = {};
  const byOperation = {};

  for (const r of rows) {
    const cost = parseFloat(r.estimated_cost_usd || 0);
    const pTokens = parseInt(r.prompt_tokens || 0, 10);
    const cTokens = parseInt(r.completion_tokens || 0, 10);
    const tTokens = parseInt(r.total_tokens || 0, 10);

    totalCostUsd += cost;
    promptTokens += pTokens;
    completionTokens += cTokens;
    totalTokens += tTokens;

    // Model aggregation
    const model = r.model_name || "unknown";
    if (!byModel[model]) {
      byModel[model] = { requests: 0, totalTokens: 0, totalCostUsd: 0 };
    }
    byModel[model].requests += 1;
    byModel[model].totalTokens += tTokens;
    byModel[model].totalCostUsd += cost;

    // Operation aggregation
    const op = r.operation_type || "summary";
    if (!byOperation[op]) {
      byOperation[op] = { requests: 0, totalTokens: 0, totalCostUsd: 0 };
    }
    byOperation[op].requests += 1;
    byOperation[op].totalTokens += tTokens;
    byOperation[op].totalCostUsd += cost;
  }

  return {
    totalRequests: rows.length,
    totalCostUsd: Number(totalCostUsd.toFixed(6)),
    totalTokens,
    promptTokens,
    completionTokens,
    breakdownByModel: byModel,
    breakdownByOperation: byOperation,
  };
};
