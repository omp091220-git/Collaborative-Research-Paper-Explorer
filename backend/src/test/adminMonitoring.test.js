import test, { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app.js";
import pool from "../config/database.js";
import { ROLES } from "../utils/roles.js";
import { calculateCostUsd, getModelPricing } from "../config/pricing.js";
import { formatBytes, getPhysicalDiskStorage } from "../services/storageMonitor.service.js";
import { parseRedisConfig, parseRedisInfo, getRedisQueueMetrics } from "../services/redisMonitor.service.js";

const TEST_SECRET = process.env.JWT_SECRET || "super_secure_test_jwt_secret_with_32_characters_12345";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const RESEARCHER_ID = "00000000-0000-4000-8000-000000000002";
const STUDENT_ID = "00000000-0000-4000-8000-000000000003";

function tokenFor(userId, role) {
  return jwt.sign({ id: userId, role }, TEST_SECRET, { expiresIn: "1h" });
}

const originalQuery = pool.query;

describe("System-Administrator Monitoring Dashboard Backend Suite", () => {
  before(() => {
    // Intercept database queries for hermetic testing
    pool.query = async (sql, params) => {
      const text = String(sql);

      // User lookup for authorizeRoles / auth repository
      if (text.includes("FROM users") && text.includes("WHERE id = $1")) {
        const id = params?.[0];
        if (id === ADMIN_ID) {
          return {
            rows: [{ id: ADMIN_ID, email: "admin@univ.edu", role: ROLES.SYSTEM_ADMIN }],
          };
        }
        if (id === RESEARCHER_ID) {
          return {
            rows: [{ id: RESEARCHER_ID, email: "researcher@univ.edu", role: ROLES.RESEARCHER }],
          };
        }
        if (id === STUDENT_ID) {
          return {
            rows: [{ id: STUDENT_ID, email: "student@univ.edu", role: ROLES.STUDENT }],
          };
        }
        return { rows: [] };
      }

      // Storage aggregate query
      if (text.includes("COUNT(*)::INT AS paper_count") && text.includes("FROM papers")) {
        return {
          rows: [
            {
              paper_count: 5,
              total_bytes: 15728640, // 15 MB
              avg_file_size_bytes: 3145728, // 3 MB
              max_file_size_bytes: 5242880, // 5 MB
            },
          ],
        };
      }

      // MIME breakdown
      if (text.includes("GROUP BY mime_type")) {
        return {
          rows: [
            {
              mime_type: "application/pdf",
              count: 5,
              total_bytes: 15728640,
            },
          ],
        };
      }

      // Top uploaders
      if (text.includes("GROUP BY u.id, u.full_name, u.email")) {
        return {
          rows: [
            {
              id: RESEARCHER_ID,
              full_name: "Dr. Alice",
              email: "alice@univ.edu",
              paper_count: 5,
              total_bytes: 15728640,
            },
          ],
        };
      }

      // Recent papers
      if (text.includes("ORDER BY p.uploaded_at DESC")) {
        return {
          rows: [
            {
              id: "paper-uuid-1",
              title: "Attention Is All You Need",
              arxiv_id: "1706.03762",
              file_size_bytes: 5242880,
              mime_type: "application/pdf",
              uploaded_at: new Date().toISOString(),
              uploader_name: "Dr. Alice",
              uploader_email: "alice@univ.edu",
            },
          ],
        };
      }

      // GenAI Summary Aggregates
      if (text.includes("FROM genai_usage_logs") && text.includes("total_cost_usd")) {
        return {
          rows: [
            {
              total_tokens: 150000,
              prompt_tokens: 120000,
              completion_tokens: 30000,
              total_cost_usd: 0.018000,
              total_requests: 12,
              actual_reported_count: 10,
              estimated_count: 2,
            },
          ],
        };
      }

      // GenAI Model Breakdown
      if (text.includes("GROUP BY model_name, provider")) {
        return {
          rows: [
            {
              model_name: "gemini-1.5-flash",
              provider: "google",
              request_count: 8,
              total_tokens: 100000,
              prompt_tokens: 80000,
              completion_tokens: 20000,
              total_cost_usd: 0.012000,
            },
          ],
        };
      }

      // GenAI Provider Breakdown
      if (text.includes("GROUP BY provider")) {
        return {
          rows: [
            {
              provider: "google",
              request_count: 12,
              total_tokens: 150000,
              total_cost_usd: 0.018000,
            },
          ],
        };
      }

      // GenAI Time Series
      if (text.includes("GROUP BY DATE(created_at)")) {
        return {
          rows: [
            {
              date: "2026-10-26",
              prompt_tokens: 120000,
              completion_tokens: 30000,
              total_tokens: 150000,
              cost_usd: 0.018000,
              request_count: 12,
            },
          ],
        };
      }

      // GenAI Recent Logs
      if (text.includes("FROM genai_usage_logs g")) {
        return {
          rows: [
            {
              id: "log-uuid-1",
              model_name: "gemini-1.5-flash",
              provider: "google",
              prompt_tokens: 1500,
              completion_tokens: 450,
              total_tokens: 1950,
              is_estimated: false,
              estimated_cost_usd: 0.000248,
              operation_type: "summary",
              status: "success",
              created_at: new Date().toISOString(),
              paper_title: "Attention Is All You Need",
              user_name: "Admin User",
              user_email: "admin@univ.edu",
            },
          ],
        };
      }

      // GenAI Usage Insert
      if (text.includes("INSERT INTO genai_usage_logs")) {
        return {
          rows: [
            {
              id: "new-log-uuid",
              user_id: params[0],
              paper_id: params[1],
              provider: params[2],
              model_name: params[3],
              prompt_tokens: params[4],
              completion_tokens: params[5],
              total_tokens: params[6],
              is_estimated: params[7],
              estimated_cost_usd: params[8],
              operation_type: params[9],
              status: params[10],
              created_at: new Date().toISOString(),
            },
          ],
        };
      }

      return { rows: [] };
    };
  });

  after(() => {
    pool.query = originalQuery;
  });

  // =========================================================================
  // 1. RBAC & Security Enforcement
  // =========================================================================
  describe("Authentication & RBAC Authorization", () => {
    it("should return 401 when accessing monitoring endpoints without a token", async () => {
      const res = await request(app).get("/api/admin/monitoring/overview");
      assert.equal(res.status, 401);
      assert.ok(res.body.error);
    });

    it("should return 403 when a STUDENT role attempts to access /overview", async () => {
      const token = tokenFor(STUDENT_ID, ROLES.STUDENT);
      const res = await request(app)
        .get("/api/admin/monitoring/overview")
        .set("Cookie", [`token=${token}`]);
      assert.equal(res.status, 403);
      assert.equal(res.body.code, "FORBIDDEN");
    });

    it("should return 403 when a RESEARCHER role attempts to access /storage", async () => {
      const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
      const res = await request(app)
        .get("/api/admin/monitoring/storage")
        .set("Cookie", [`token=${token}`]);
      assert.equal(res.status, 403);
      assert.equal(res.body.code, "FORBIDDEN");
    });

    it("should return 403 when a RESEARCHER attempts to access /redis", async () => {
      const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
      const res = await request(app)
        .get("/api/admin/monitoring/redis")
        .set("Cookie", [`token=${token}`]);
      assert.equal(res.status, 403);
    });

    it("should return 403 when a RESEARCHER attempts to access /genai", async () => {
      const token = tokenFor(RESEARCHER_ID, ROLES.RESEARCHER);
      const res = await request(app)
        .get("/api/admin/monitoring/genai")
        .set("Cookie", [`token=${token}`]);
      assert.equal(res.status, 403);
    });

    it("should permit SYSTEM_ADMIN role to access /overview successfully", async () => {
      const token = tokenFor(ADMIN_ID, ROLES.SYSTEM_ADMIN);
      const res = await request(app)
        .get("/api/admin/monitoring/overview")
        .set("Cookie", [`token=${token}`]);

      assert.equal(res.status, 200);
      assert.ok(res.body.overview);
      assert.ok(res.body.overview.storage);
      assert.ok(res.body.overview.redis);
      assert.ok(res.body.overview.genai);
    });
  });

  // =========================================================================
  // 2. Storage Quota & Metric Calculations
  // =========================================================================
  describe("Storage Monitoring Metrics & Quota Calculations", () => {
    it("should format bytes into human-readable units accurately", () => {
      assert.equal(formatBytes(0), "0 B");
      assert.equal(formatBytes(1024), "1 KB");
      assert.equal(formatBytes(1048576), "1 MB");
      assert.equal(formatBytes(1073741824), "1 GB");
    });

    it("should return structured storage metrics via GET /api/admin/monitoring/storage", async () => {
      const prevQuota = process.env.STORAGE_QUOTA_MB;
      process.env.STORAGE_QUOTA_MB = "100"; // 100 MB quota

      const token = tokenFor(ADMIN_ID, ROLES.SYSTEM_ADMIN);
      const res = await request(app)
        .get("/api/admin/monitoring/storage")
        .set("Cookie", [`token=${token}`]);

      assert.equal(res.status, 200);
      assert.equal(res.body.quota.configured, true);
      assert.equal(res.body.quota.quotaBytes, 100 * 1024 * 1024);
      assert.equal(res.body.usage.paperCount, 5);
      assert.equal(res.body.usage.totalBytes, 15728640);
      assert.ok(res.body.usage.utilizationPercent > 0);
      assert.ok(res.body.usage.remainingBytes > 0);
      assert.equal(res.body.usage.isWarning, false);
      assert.equal(res.body.usage.status, "HEALTHY");
      assert.ok(Array.isArray(res.body.mimeBreakdown));
      assert.ok(Array.isArray(res.body.topUploaders));
      assert.ok(Array.isArray(res.body.recentPapers));

      process.env.STORAGE_QUOTA_MB = prevQuota;
    });

    it("should flag unconfigured quota honestly when no quota env var is set", async () => {
      const prevBytes = process.env.STORAGE_QUOTA_BYTES;
      const prevMb = process.env.STORAGE_QUOTA_MB;
      delete process.env.STORAGE_QUOTA_BYTES;
      delete process.env.STORAGE_QUOTA_MB;

      const token = tokenFor(ADMIN_ID, ROLES.SYSTEM_ADMIN);
      const res = await request(app)
        .get("/api/admin/monitoring/storage")
        .set("Cookie", [`token=${token}`]);

      assert.equal(res.status, 200);
      assert.equal(res.body.quota.configured, false);
      assert.equal(res.body.quota.quotaBytes, null);
      assert.equal(res.body.usage.remainingBytes, null);
      assert.equal(res.body.usage.status, "UNCONFIGURED");

      process.env.STORAGE_QUOTA_BYTES = prevBytes;
      process.env.STORAGE_QUOTA_MB = prevMb;
    });

    it("should safely inspect physical uploads directory without throwing", () => {
      const physical = getPhysicalDiskStorage();
      assert.ok(typeof physical.exists === "boolean");
      assert.ok(typeof physical.totalBytes === "number");
      assert.ok(typeof physical.fileCount === "number");
    });
  });

  // =========================================================================
  // 3. Redis Queue Monitoring & Honest Unconfigured State
  // =========================================================================
  describe("Redis Queue Monitoring & Availability Handling", () => {
    it("should return honest NOT_CONFIGURED state when REDIS_URL is absent", async () => {
      const prevUrl = process.env.REDIS_URL;
      const prevHost = process.env.REDIS_HOST;
      delete process.env.REDIS_URL;
      delete process.env.REDIS_HOST;

      const token = tokenFor(ADMIN_ID, ROLES.SYSTEM_ADMIN);
      const res = await request(app)
        .get("/api/admin/monitoring/redis")
        .set("Cookie", [`token=${token}`]);

      assert.equal(res.status, 200);
      assert.equal(res.body.configured, false);
      assert.equal(res.body.status, "NOT_CONFIGURED");
      assert.equal(res.body.connected, false);
      assert.ok(res.body.message.includes("not configured"));
      assert.ok(res.body.integrationGuide);
      assert.ok(res.body.integrationGuide.steps.length > 0);

      process.env.REDIS_URL = prevUrl;
      process.env.REDIS_HOST = prevHost;
    });

    it("should handle unavailable connection gracefully without leaking secrets", async () => {
      // Point to an unavailable local port
      const testConfig = {
        configured: true,
        host: "127.0.0.1",
        port: 59999,
        password: "super_secret_redis_password",
        urlSafe: "redis://127.0.0.1:59999",
      };

      const result = await getRedisQueueMetrics(testConfig);
      assert.equal(result.configured, true);
      assert.equal(result.status, "UNAVAILABLE");
      assert.equal(result.connected, false);
      // Ensure password is not exposed in message or response
      assert.ok(!JSON.stringify(result).includes("super_secret_redis_password"));
    });

    it("should parse Redis INFO string correctly", () => {
      const sampleInfo = "# Server\r\nredis_version:7.2.4\r\nuptime_in_days:5\r\n# Memory\r\nused_memory_human:14.2M\r\nconnected_clients:3\r\n";
      const parsed = parseRedisInfo(sampleInfo);
      assert.equal(parsed.redis_version, "7.2.4");
      assert.equal(parsed.uptime_in_days, "5");
      assert.equal(parsed.used_memory_human, "14.2M");
      assert.equal(parsed.connected_clients, "3");
    });
  });

  // =========================================================================
  // 4. GenAI API Token Consumption & Accurate Pricing Calculations
  // =========================================================================
  describe("GenAI Token Consumption & Pricing Calculations", () => {
    it("should calculate exact costs using official model pricing configuration", () => {
      // Gemini 1.5 Flash: $0.075 / 1M prompt, $0.30 / 1M completion
      const flashCost = calculateCostUsd("gemini-1.5-flash", 1_000_000, 1_000_000);
      assert.equal(flashCost, 0.375);

      // GPT-4o: $2.50 / 1M prompt, $10.00 / 1M completion
      const gptCost = calculateCostUsd("gpt-4o", 1_000_000, 1_000_000);
      assert.equal(gptCost, 12.5);

      // Claude 3.5 Sonnet: $3.00 / 1M prompt, $15.00 / 1M completion
      const claudeCost = calculateCostUsd("claude-3-5-sonnet", 1_000_000, 1_000_000);
      assert.equal(claudeCost, 18.0);

      // Zero tokens should be zero cost
      assert.equal(calculateCostUsd("gemini-1.5-flash", 0, 0), 0);
    });

    it("should record valid GenAI usage via POST /api/admin/monitoring/genai/record", async () => {
      const token = tokenFor(ADMIN_ID, ROLES.SYSTEM_ADMIN);
      const res = await request(app)
        .post("/api/admin/monitoring/genai/record")
        .set("Cookie", [`token=${token}`])
        .send({
          modelName: "gemini-1.5-flash",
          promptTokens: 2500,
          completionTokens: 800,
          isEstimated: false,
          operationType: "summary",
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.record);
      assert.equal(res.body.record.model_name, "gemini-1.5-flash");
      assert.equal(res.body.record.prompt_tokens, 2500);
      assert.equal(res.body.record.completion_tokens, 800);
      assert.equal(res.body.record.total_tokens, 3300);
      assert.equal(res.body.record.is_estimated, false);
      assert.ok(res.body.record.estimated_cost_usd > 0);
    });

    it("should reject recording usage with negative token counts", async () => {
      const token = tokenFor(ADMIN_ID, ROLES.SYSTEM_ADMIN);
      const res = await request(app)
        .post("/api/admin/monitoring/genai/record")
        .set("Cookie", [`token=${token}`])
        .send({
          modelName: "gemini-1.5-flash",
          promptTokens: -50,
          completionTokens: 100,
        });

      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it("should reject recording usage with empty modelName", async () => {
      const token = tokenFor(ADMIN_ID, ROLES.SYSTEM_ADMIN);
      const res = await request(app)
        .post("/api/admin/monitoring/genai/record")
        .set("Cookie", [`token=${token}`])
        .send({
          modelName: "",
          promptTokens: 500,
          completionTokens: 100,
        });

      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it("should retrieve GenAI metrics with time period filter via GET /api/admin/monitoring/genai", async () => {
      const token = tokenFor(ADMIN_ID, ROLES.SYSTEM_ADMIN);
      const res = await request(app)
        .get("/api/admin/monitoring/genai?period=7d")
        .set("Cookie", [`token=${token}`]);

      assert.equal(res.status, 200);
      assert.equal(res.body.period, "7d");
      assert.ok(res.body.summary);
      assert.equal(res.body.summary.totalTokens, 150000);
      assert.equal(res.body.summary.promptTokens, 120000);
      assert.equal(res.body.summary.completionTokens, 30000);
      assert.equal(res.body.summary.actualReportedCount, 10);
      assert.equal(res.body.summary.estimatedCount, 2);
      assert.ok(Array.isArray(res.body.byModel));
      assert.ok(Array.isArray(res.body.byProvider));
      assert.ok(Array.isArray(res.body.timeSeries));
      assert.ok(Array.isArray(res.body.recentLogs));
      assert.ok(res.body.pricingCatalog);
    });
  });
});
