import repository from '../repositories/researchExport.repository.js';
import { readPaperPdf } from './summary.service.js';
import { buildAnnotatedPdf } from './researchExportPdf.service.js';

export const EXPORT_FORMATS = Object.freeze({
  bibtex: { type: 'application/x-bibtex; charset=utf-8', extension: 'bib' },
  markdown: { type: 'text/markdown; charset=utf-8', extension: 'md' },
  pdf: { type: 'application/pdf', extension: 'pdf' },
});
const text = value => String(value ?? '').replaceAll('\0', '');
const authors = paper => Array.isArray(paper.authors) ? paper.authors : [paper.authors].filter(Boolean);
// Literal blocks preserve Markdown, LaTeX and Unicode without executing user HTML or injected headings.
const literal = value => {
  const s = text(value);
  const fence = '`'.repeat(Math.max(3, ...[...s.matchAll(/`+/g)].map(m => m[0].length + 1)));
  return `${fence}text\n${s}\n${fence}`;
};
const date = value => value ? new Date(value).toISOString() : 'Unknown';
export const location = item => `Page ${item.page_number ?? 'unknown'}${item.box ? `; region ${JSON.stringify(item.box)}` : ''}`;

export function toMarkdown(data) {
  const { paper, annotations, summaries, tags, citations } = data;
  const lines = ['# Research export', '', '## Paper', literal(paper.title),
    'Authors:', literal(authors(paper).map(text).join('; ')), `Publication year: ${paper.publication_year ?? 'Unknown'}`,
    'DOI:', literal(paper.doi || 'None'), 'arXiv:', literal(paper.arxiv_id || 'None'),
    '', '### Abstract', literal(paper.abstract || 'No abstract saved.'), '', '## Annotations'];
  for (const a of annotations) lines.push(`### Annotation ${a.id}`, location(a), `Created: ${date(a.created_at)}`,
    `Region (normalized top-left): ${JSON.stringify({x:a.position_x,y:a.position_y,w:a.region_width,h:a.region_height})}`, literal(a.content));
  if (!annotations.length) lines.push('No annotations saved.');
  lines.push('', '## Summaries', 'Saved AI summaries only. Verify claims against the original paper.');
  for (const s of summaries) {
    lines.push(`### ${s.summary_type}`, 'Model:', literal(s.model_name), `Saved: ${date(s.created_at)}`);
    if (Array.isArray(s.sections) && s.sections.length) {
      for (const section of s.sections) lines.push(literal(section.heading), literal(section.text),
        'Source regions (one-based pages, normalized top-left):', literal(JSON.stringify(section.sources || [], null, 2)));
    } else lines.push(literal(s.summary_text));
    if (s.key_findings?.length) lines.push('Key findings:', ...s.key_findings.map(literal));
  }
  if (!summaries.length) lines.push('No summaries saved.');
  lines.push('', '## Section tags');
  for (const t of tags) lines.push(literal(t.path), `Scope: ${t.kind}; ${location(t)}`, literal(t.section || 'Whole paper'));
  if (!tags.length) lines.push('No tags saved.');
  lines.push('', '## Citations', 'Outgoing references recorded in the citation graph.');
  for (const p of citations) lines.push(`### ${citationKey(p)}`, literal(p.title),
    'Authors:', literal(authors(p).map(text).join('; ')), `Publication year: ${p.publication_year ?? 'Unknown'}`,
    'DOI:', literal(p.doi || 'None'), 'arXiv:', literal(p.arxiv_id || 'None'), literal(p.citation_context || 'No citation context saved.'));
  if (!citations.length) lines.push('No citations saved.');
  return lines.join('\n\n') + '\n';
}

// Balanced braced values: never allow note text to terminate a BibTeX entry.
export const bibEscape = value => text(value).replace(/[\\{}%&#_$^~]/g, c => ({
  '\\':'\\textbackslash{}', '{':'\\{', '}':'\\}', '%':'\\%', '&':'\\&', '#':'\\#',
  '_':'\\_', '$':'\\$', '^':'\\textasciicircum{}', '~':'\\textasciitilde{}',
}[c])).replace(/[\r\n]+/g, ' ');
export const citationKey = paper => `paper${text(paper.id).replace(/[^a-zA-Z0-9]/g, '')}`;
export function toBibtex(data) {
  return [data.paper, ...data.citations].map((paper, i) => {
    const fields = { title: paper.title, author: authors(paper).map(bibEscape).join(' and '),
      year: paper.publication_year, doi: paper.doi,
      eprint: paper.arxiv_id, archivePrefix: paper.arxiv_id ? 'arXiv' : undefined };
    if (!i) {
      fields.abstract = paper.abstract;
      fields.keywords = [...new Set(data.tags.map(t => t.path))].join('; ');
      // Standard bibliography managers retain annote as research notes.
      fields.annote = toMarkdown(data);
    } else fields.note = paper.citation_context;
    return `@misc{${citationKey(paper)},\n` + Object.entries(fields)
      .filter(([,value]) => value !== null && value !== undefined && value !== '')
      .map(([key,value]) => `  ${key} = {${key === 'author' ? value : bibEscape(value)}}`).join(',\n') + '\n}';
  }).join('\n\n') + '\n';
}

export async function createResearchExport(paperId, format, deps = {}) {
  if (!Object.hasOwn(EXPORT_FORMATS, format)) throw Object.assign(new Error('Choose bibtex, markdown, or pdf.'), {statusCode:400});
  const data = await (deps.repository || repository).snapshot(paperId);
  if (!data) throw Object.assign(new Error('Paper not found.'), {statusCode:404});
  const markdown = toMarkdown(data);
  const bibtex = toBibtex(data);
  let buffer;
  if (format === 'pdf') {
    try {
      const original = await (deps.readPdf || readPaperPdf)(data.paper);
      buffer = await buildAnnotatedPdf(original, data, {markdown, bibtex});
    } catch (error) {
      if (error.statusCode) throw error;
      throw Object.assign(new Error('The original PDF could not be loaded. Retry, or export Markdown or BibTeX.'), {statusCode:422});
    }
  } else buffer = Buffer.from(format === 'markdown' ? markdown : bibtex, 'utf8');
  const stem = text(data.paper.title).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0,80) || 'research-paper';
  return { buffer, type: EXPORT_FORMATS[format].type, filename:`${stem}-research.${EXPORT_FORMATS[format].extension}` };
}
