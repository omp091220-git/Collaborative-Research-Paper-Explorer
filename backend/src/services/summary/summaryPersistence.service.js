import pool from "../../config/database.js";
import { SUMMARY_SCHEMA_VERSION } from "./summarySections.js";

export const SUMMARY_TYPE = "comprehensive";

export function buildSummaryText(sections = []) {
  return sections.map((section) => {
    const text = section.status === "supported" && section.text
      ? section.text
      : "Insufficient information found in the extractable text of this paper.";
    return `${section.title}\n${text}`;
  }).join("\n\n");
}

export function buildKeyFindings(sections = []) {
  return sections
    .filter((section) => section.status === "supported" && section.text)
    .map((section) => `${section.title}: ${section.text}`);
}

/**
 * Persist a successful structured summary and its content-addressed cache entry
 * atomically. The `paper_summaries` row remains compatible with the project's
 * existing schema and uniqueness constraint.
 */
export async function persistSummary({
  db = pool,
  paperId,
  generatedBy,
  modelName,
  sourceSha256,
  pageCount,
  sections,
  schemaVersion = SUMMARY_SCHEMA_VERSION,
}) {
  const summaryText = buildSummaryText(sections);
  const keyFindings = buildKeyFindings(sections);
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO paper_summary_cache
         (source_sha256, model_name, schema_version, summary_type,
          structured_sections, summary_text, key_findings, source_page_count)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
       ON CONFLICT (source_sha256, model_name, schema_version, summary_type) DO NOTHING`,
      [sourceSha256, modelName, schemaVersion, SUMMARY_TYPE, JSON.stringify(sections), summaryText, keyFindings, pageCount]
    );

    // If another concurrent job populated the cache first, use that canonical
    // entry so the summary persisted for this paper exactly matches the cache.
    const cacheResult = await client.query(
      `SELECT id, structured_sections, summary_text, key_findings, source_page_count
         FROM paper_summary_cache
        WHERE source_sha256 = $1 AND model_name = $2 AND schema_version = $3 AND summary_type = $4`,
      [sourceSha256, modelName, schemaVersion, SUMMARY_TYPE]
    );
    const canonical = cacheResult.rows[0];
    if (!canonical) throw new Error("Summary cache entry could not be persisted.");

    await client.query(
      `INSERT INTO paper_summary_cache_papers (cache_id, paper_id)
       VALUES ($1, $2) ON CONFLICT (cache_id, paper_id) DO NOTHING`,
      [canonical.id, paperId]
    );

    const result = await client.query(
      `INSERT INTO paper_summaries
         (paper_id, model_name, summary_type, summary_text, key_findings,
          generated_by, structured_sections, source_sha256, schema_version, source_page_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
       ON CONFLICT (paper_id, model_name, summary_type)
       DO UPDATE SET summary_text = EXCLUDED.summary_text,
                     key_findings = EXCLUDED.key_findings,
                     generated_by = EXCLUDED.generated_by,
                     structured_sections = EXCLUDED.structured_sections,
                     source_sha256 = EXCLUDED.source_sha256,
                     schema_version = EXCLUDED.schema_version,
                     source_page_count = EXCLUDED.source_page_count,
                     created_at = CURRENT_TIMESTAMP
       RETURNING id, paper_id, model_name, summary_type, summary_text,
                 key_findings, generated_by, structured_sections, source_sha256,
                 schema_version, source_page_count, created_at`,
      [paperId, modelName, SUMMARY_TYPE, canonical.summary_text, canonical.key_findings,
        generatedBy ?? null, JSON.stringify(canonical.structured_sections), sourceSha256,
        schemaVersion, canonical.source_page_count ?? pageCount]
    );

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getCachedSummary({ db = pool, sourceSha256, modelName, schemaVersion = SUMMARY_SCHEMA_VERSION }) {
  const result = await db.query(
    `SELECT structured_sections, summary_text, key_findings, source_page_count
       FROM paper_summary_cache
      WHERE source_sha256 = $1 AND model_name = $2 AND schema_version = $3 AND summary_type = $4`,
    [sourceSha256, modelName, schemaVersion, SUMMARY_TYPE]
  );
  return result.rows[0] ?? null;
}
