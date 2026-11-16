import pool from '../config/database.js';
import { observePgClient, isPgConnectionError } from '../utils/pgClientErrors.js';

// One read-only snapshot: exports must not mix edits from different moments.
export function createResearchExportRepository(db = pool) {
  return {
    async snapshot(paperId) {
      const client = await db.connect();
      const state = observePgClient(client);
      let failure;
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await client.query("SET LOCAL statement_timeout = '15s'");
        const paper = (await client.query(`SELECT id, title, authors, abstract, doi,
          publication_year, arxiv_id, file_path FROM papers WHERE id = $1`, [paperId])).rows[0];
        if (!paper) { await client.query('COMMIT'); return null; }
        const annotations = (await client.query(`SELECT id, page_number, content, position_x,
          position_y, region_width, region_height, created_at FROM annotations
          WHERE paper_id = $1 ORDER BY page_number, created_at, id`, [paperId])).rows;
        // Keep legacy summaries as well as FR-08 structured evidence, without duplicating each summary.
        const summaries = (await client.query(`SELECT s.id, s.summary_type, s.model_name,
          s.summary_text, s.key_findings, s.created_at, j.sections
          FROM paper_summaries s LEFT JOIN structured_summary_jobs j
          ON j.paper_id = s.paper_id AND j.summary_type = s.summary_type AND j.model_name = s.model_name
          AND j.status = 'completed'
          WHERE s.paper_id = $1 ORDER BY s.summary_type, s.model_name, s.id`, [paperId])).rows;
        const tags = (await client.query(`WITH RECURSIVE paths AS (
          SELECT id, ARRAY[id] AS visited, name::text AS path FROM topic_tags WHERE parent_id IS NULL
          UNION ALL
          SELECT t.id, p.visited || t.id, p.path || ' > ' || t.name FROM topic_tags t
          JOIN paths p ON t.parent_id = p.id WHERE NOT t.id = ANY(p.visited)
        ), assignments AS (
          SELECT p.id, p.tag_id, CASE WHEN p.annotation_id IS NULL THEN 'paper' ELSE 'annotation' END AS kind, a.page_number,
            a.content AS section, jsonb_build_object('x', a.position_x, 'y', a.position_y,
            'w', a.region_width, 'h', a.region_height) AS box
          FROM paper_tag_assignments p LEFT JOIN annotations a ON a.id = p.annotation_id AND a.paper_id = p.paper_id
          WHERE p.paper_id = $1
          UNION ALL
          SELECT p.id, p.tag_id, 'paragraph', p.page_number, p.section_name, p.bounding_box
          FROM paper_tags p WHERE p.paper_id = $1
          UNION ALL
          SELECT p.id, p.tag_id, 'section', s.page_number, s.section_title, NULL::jsonb
          FROM paper_section_tags p JOIN paper_sections s ON s.id = p.section_id AND s.paper_id = p.paper_id
          WHERE p.paper_id = $1
        ) SELECT a.*, COALESCE(p.path, t.name) AS path FROM assignments a
          JOIN topic_tags t ON t.id = a.tag_id LEFT JOIN paths p ON p.id = t.id
          ORDER BY path, page_number NULLS FIRST, id`, [paperId])).rows;
        const citations = (await client.query(`SELECT p.id, p.title, p.authors, p.doi,
          p.publication_year, p.arxiv_id, c.citation_context FROM citations c
          JOIN papers p ON p.id = c.cited_paper_id WHERE c.citing_paper_id = $1
          ORDER BY p.title, p.id`, [paperId])).rows;
        await client.query('COMMIT');
        return { paper, annotations, summaries, tags, citations };
      } catch (error) {
        failure = state.error || error;
        if (!state.error) await client.query('ROLLBACK').catch(() => {});
        throw state.error || error;
      } finally {
        client.release(Boolean(state.error || isPgConnectionError(failure)));
      }
    },
  };
}
export default createResearchExportRepository();
