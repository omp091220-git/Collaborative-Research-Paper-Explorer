import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");

/**
 * Format bytes to human-readable strings (B, KB, MB, GB).
 */
export const formatBytes = (bytes, decimals = 2) => {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return "0 B";
  if (bytes === 0) return "0 B";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Inspect actual files stored on the physical disk in uploads/
 */
export const getPhysicalDiskStorage = () => {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      return {
        exists: false,
        totalBytes: 0,
        fileCount: 0,
        formattedBytes: "0 B",
      };
    }

    const files = fs.readdirSync(UPLOADS_DIR);
    let totalBytes = 0;
    let fileCount = 0;

    for (const file of files) {
      if (file === ".gitkeep" || file === ".gitignore") continue;

      const filePath = path.join(UPLOADS_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          totalBytes += stats.size;
          fileCount += 1;
        }
      } catch {
        // Skip inaccessible files safely
      }
    }

    return {
      exists: true,
      totalBytes,
      fileCount,
      formattedBytes: formatBytes(totalBytes),
    };
  } catch (error) {
    return {
      exists: false,
      totalBytes: 0,
      fileCount: 0,
      formattedBytes: "0 B",
      error: error.message,
    };
  }
};

/**
 * Get comprehensive storage metrics from database and physical disk.
 */
export const getStorageMetrics = async () => {
  // 1. Database metadata aggregation
  const dbAggregateQuery = `
    SELECT
      COUNT(*)::INT AS paper_count,
      COALESCE(SUM(file_size_bytes), 0)::BIGINT AS total_bytes,
      COALESCE(AVG(file_size_bytes), 0)::BIGINT AS avg_file_size_bytes,
      COALESCE(MAX(file_size_bytes), 0)::BIGINT AS max_file_size_bytes
    FROM papers;
  `;

  // 2. MIME type distribution
  const mimeQuery = `
    SELECT
      mime_type,
      COUNT(*)::INT AS count,
      COALESCE(SUM(file_size_bytes), 0)::BIGINT AS total_bytes
    FROM papers
    GROUP BY mime_type
    ORDER BY total_bytes DESC;
  `;

  // 3. Top Uploaders by storage consumed
  const topUploadersQuery = `
    SELECT
      u.id,
      u.full_name,
      u.email,
      COUNT(p.id)::INT AS paper_count,
      COALESCE(SUM(p.file_size_bytes), 0)::BIGINT AS total_bytes
    FROM papers p
    JOIN users u ON p.uploader_id = u.id
    GROUP BY u.id, u.full_name, u.email
    ORDER BY total_bytes DESC
    LIMIT 10;
  `;

  // 4. Recent papers stored
  const recentPapersQuery = `
    SELECT
      p.id,
      p.title,
      p.arxiv_id,
      p.file_path,
      p.file_size_bytes,
      p.mime_type,
      p.uploaded_at,
      u.full_name AS uploader_name,
      u.email AS uploader_email
    FROM papers p
    LEFT JOIN users u ON p.uploader_id = u.id
    ORDER BY p.uploaded_at DESC
    LIMIT 30;
  `;

  const [aggRes, mimeRes, topUploadersRes, recentPapersRes] =
    await Promise.all([
      pool.query(dbAggregateQuery),
      pool.query(mimeQuery),
      pool.query(topUploadersQuery),
      pool.query(recentPapersQuery),
    ]);

  const aggRow = aggRes.rows[0] || {};
  const dbTotalBytes = Number(aggRow.total_bytes || 0);
  const paperCount = Number(aggRow.paper_count || 0);
  const avgSizeBytes = Number(aggRow.avg_file_size_bytes || 0);
  const maxSizeBytes = Number(aggRow.max_file_size_bytes || 0);

  // 5. Physical disk inspection
  const diskStorage = getPhysicalDiskStorage();

  // 6. Quota resolution
  let quotaBytes = null;
  if (process.env.STORAGE_QUOTA_BYTES) {
    quotaBytes = parseInt(process.env.STORAGE_QUOTA_BYTES, 10);
  } else if (process.env.STORAGE_QUOTA_MB) {
    quotaBytes = parseInt(process.env.STORAGE_QUOTA_MB, 10) * 1024 * 1024;
  }

  const warningThreshold = Number(process.env.STORAGE_WARNING_THRESHOLD_PERCENT || 80);
  const criticalThreshold = Number(process.env.STORAGE_CRITICAL_THRESHOLD_PERCENT || 90);

  const quotaConfigured = quotaBytes !== null && !isNaN(quotaBytes) && quotaBytes > 0;
  let remainingBytes = null;
  let utilizationPercent = null;
  let isWarning = false;
  let isCritical = false;
  let status = "HEALTHY";

  if (quotaConfigured) {
    remainingBytes = Math.max(0, quotaBytes - dbTotalBytes);
    utilizationPercent = Number(((dbTotalBytes / quotaBytes) * 100).toFixed(2));
    isWarning = utilizationPercent >= warningThreshold && utilizationPercent < criticalThreshold;
    isCritical = utilizationPercent >= criticalThreshold;
    status = isCritical ? "CRITICAL" : isWarning ? "WARNING" : "HEALTHY";
  } else {
    status = "UNCONFIGURED";
  }

  return {
    quota: {
      configured: quotaConfigured,
      quotaBytes,
      quotaFormatted: quotaConfigured ? formatBytes(quotaBytes) : "No Quota Configured",
      warningThresholdPercent: warningThreshold,
      criticalThresholdPercent: criticalThreshold,
    },
    usage: {
      totalBytes: dbTotalBytes,
      totalFormatted: formatBytes(dbTotalBytes),
      paperCount,
      avgFileSizeBytes: avgSizeBytes,
      avgFileSizeFormatted: formatBytes(avgSizeBytes),
      maxFileSizeBytes: maxSizeBytes,
      maxFileSizeFormatted: formatBytes(maxSizeBytes),
      remainingBytes,
      remainingFormatted: remainingBytes !== null ? formatBytes(remainingBytes) : "N/A",
      utilizationPercent,
      isWarning,
      isCritical,
      status,
    },
    diskInspection: {
      exists: diskStorage.exists,
      fileCount: diskStorage.fileCount,
      totalBytes: diskStorage.totalBytes,
      formattedBytes: diskStorage.formattedBytes,
    },
    mimeBreakdown: mimeRes.rows.map((row) => ({
      mimeType: row.mime_type,
      count: Number(row.count),
      totalBytes: Number(row.total_bytes),
      formattedBytes: formatBytes(Number(row.total_bytes)),
    })),
    topUploaders: topUploadersRes.rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      paperCount: Number(row.paper_count),
      totalBytes: Number(row.total_bytes),
      formattedBytes: formatBytes(Number(row.total_bytes)),
    })),
    recentPapers: recentPapersRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      arxivId: row.arxiv_id,
      fileSize: Number(row.file_size_bytes),
      fileSizeFormatted: formatBytes(Number(row.file_size_bytes)),
      mimeType: row.mime_type,
      uploadedAt: row.uploaded_at,
      uploaderName: row.uploader_name || "Unknown",
      uploaderEmail: row.uploader_email || "Unknown",
    })),
  };
};

export default {
  formatBytes,
  getPhysicalDiskStorage,
  getStorageMetrics,
};
