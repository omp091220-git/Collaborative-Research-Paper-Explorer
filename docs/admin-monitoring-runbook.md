# System Administrator Monitoring Dashboard (FR-21) — Operational Runbook

## 1. Overview & Architectural Scope
Functional Requirement **FR-21** mandates a dedicated, secure observability dashboard and operational monitoring framework for System Administrators. The subsystem monitors three critical resources:
1. **Storage Quotas & Disk Capacities:** Tracking file uploads, database paper registrations, disk consumption, and forecasting storage burnout.
2. **Redis Job Queues & Worker Settlement:** Real-time visibility into asynchronous workers (OCR, text extraction, GenAI summarization), handling connection drops gracefully without secret leakage.
3. **GenAI Token Consumption & Financial Accounting:** Tracking input/output tokens, calculating exact USD expenditures using published pricing tiers (e.g. Gemini 1.5 Flash / Pro), and exporting compliance audit trails.

---

## 2. Security & Role-Based Access Control (RBAC)
All administrative monitoring endpoints and user interface views are restricted exclusively to users holding the `SYSTEM_ADMIN` role.
- Unauthenticated requests are rejected immediately with HTTP `401 Unauthorized`.
- Authenticated users with `STUDENT` or `RESEARCHER` roles are rejected with HTTP `403 Forbidden` (`code: "FORBIDDEN"`).
- Secrets (such as Redis connection passwords or raw database connection strings) are sanitized prior to response serialization.

| Method | Endpoint | Description | Role Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/monitoring/overview` | High-level summary metrics across storage, redis, and GenAI | `SYSTEM_ADMIN` |
| `GET` | `/api/admin/monitoring/storage` | Detailed storage utilization, MIME breakdown, top uploaders | `SYSTEM_ADMIN` |
| `GET` | `/api/admin/monitoring/storage/forecast` | Historical upload trajectory, burn rate, days to exhaustion | `SYSTEM_ADMIN` |
| `GET` | `/api/admin/monitoring/redis` | Redis connectivity, active queues, job settlement telemetry | `SYSTEM_ADMIN` |
| `GET` | `/api/admin/monitoring/genai` | Token counts, cost breakdown by model, time-series metrics | `SYSTEM_ADMIN` |
| `POST` | `/api/admin/monitoring/genai/record` | Ingestion endpoint to log token usage from AI pipelines | `SYSTEM_ADMIN` |
| `GET` | `/api/admin/monitoring/diagnostics/system` | Node process memory, CPU utilization, OS metrics, DB pool | `SYSTEM_ADMIN` |
| `GET` | `/api/admin/monitoring/reports/audit-export` | Compliance audit trail export in JSON or RFC-4180 CSV | `SYSTEM_ADMIN` |

---

## 3. Storage Quota & Capacity Forecasting Model

### 3.1 Quota Threshold States
The storage monitoring engine resolves quotas from `STORAGE_QUOTA_BYTES` or `STORAGE_QUOTA_MB`.
- **Healthy (`< 80%`):** Normal operating capacity.
- **Warning (`80% – 89.9%`):** Administrators receive advisory alerts to plan archiving or disk expansion.
- **Critical (`>= 90%`):** High risk of disk saturation; immediate administrative intervention required.
- **Unconfigured:** When no quota environment variables are provided, the platform operates in unmetered mode without falsifying values.

### 3.2 Linear Burn-Rate & Exhaustion Formula
Storage exhaustion is calculated dynamically over an adjustable lookback window (default: 30 days):
$$\text{Daily Burn Rate} = \frac{\sum \text{Bytes Uploaded in Window}}{\text{Window Days}}$$
$$\text{Days to Exhaustion} = \left\lfloor \frac{\text{Quota Bytes} - \text{Total Used Bytes}}{\text{Daily Burn Rate}} \right\rfloor$$

When `Days to Exhaustion` $\le 7$, the system emits a `CRITICAL_CAPACITY_RISK` alert.

---

## 4. Redis Queue Degradation & Fail-Safe Design
When Redis is offline, unreachable, or unconfigured in local development:
1. The backend socket probe (`probeRedisServer`) enforces a strict timeout (2,000ms) and destroys dangling sockets to prevent event loop starvation.
2. The endpoint returns `status: "NOT_CONFIGURED"` or `status: "UNAVAILABLE"` with an actionable 4-step deployment integration guide.
3. System administrators can diagnose queue processing without application crashes.

---

## 5. GenAI Token Accounting & Pricing Model

### 5.1 Pricing Matrix Reference (Per 1 Million Tokens)
| Model Identifier | Input Cost / 1M Tokens | Output Cost / 1M Tokens | Default Provider |
| :--- | :--- | :--- | :--- |
| `gemini-1.5-flash` | \$0.075 | \$0.300 | Google Gemini |
| `gemini-1.5-pro` | \$1.250 | \$5.000 | Google Gemini |
| `gemini-2.0-flash` | \$0.100 | \$0.400 | Google Gemini |
| `gemini-1.0-pro` | \$0.500 | \$1.500 | Google Gemini |

Total cost in USD is calculated as:
$$\text{Cost} = \left(\text{Prompt Tokens} \times \frac{\text{Rate}_{\text{input}}}{1,000,000}\right) + \left(\text{Completion Tokens} \times \frac{\text{Rate}_{\text{output}}}{1,000,000}\right)$$

---

## 6. Audit & Compliance Export
Administrators can generate downloadable audit records for institutional compliance:
- **JSON Format:** `/api/admin/monitoring/reports/audit-export?period=30d&format=json`
- **CSV Format:** `/api/admin/monitoring/reports/audit-export?period=30d&format=csv` (Delivered as an attachment with RFC-4180 escaping).
