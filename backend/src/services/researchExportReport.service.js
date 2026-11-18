import fs from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { rgb } from 'pdf-lib';

const fontBytes = fs.readFile(new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url));
const clean = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const authorNames = paper => Array.isArray(paper.authors) ? paper.authors.join('; ') : paper.authors || 'Unknown authors';
const region = source => `Page ${source.page ?? source.page_number ?? 'unknown'}` +
  (source.x != null && source.y != null ? ` (${(Number(source.x)*100).toFixed(1)}%, ${(Number(source.y)*100).toFixed(1)}%)` : '');

// A visible, searchable appendix travels with the source PDF. Comments and file
// attachments remain available, but opening either panel is no longer required.
export async function appendResearchReport(doc, data, notices = []) {
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await fontBytes, {subset:true});
  const supported = new Set(font.getCharacterSet());
  let replaced = false;
  const printable = value => Array.from(clean(value)).map(c => {
    if (c === '\n' || c === '\r' || c === '\t' || supported.has(c.codePointAt(0))) return c;
    replaced = true;
    return `[U+${c.codePointAt(0).toString(16).toUpperCase()}]`;
  }).join('').replace(/\r\n?/g, '\n').replaceAll('\t', '    ');
  const width = 595.28, height = 841.89, margin = 48, textWidth = width-2*margin;
  const sourcePages = doc.getPageCount();
  let page, y, number = 0;
  const newPage = () => {
    page = doc.addPage([width,height]); y = height-margin; number++;
    page.drawText(`Research report | Appendix ${number} | Original paper: ${sourcePages} pages`,
      {x:margin,y:25,size:8,font,color:rgb(0.3,0.35,0.42)});
  };
  const wrap = (value, size) => {
    const lines = [];
    for (const paragraph of printable(value).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (line && font.widthOfTextAtSize(line+' '+word,size) <= textWidth) {line += ' '+word; continue;}
        if (line) {lines.push(line); line = '';}
        if (font.widthOfTextAtSize(word,size) <= textWidth) {line = word; continue;}
        // Long URLs, source IDs and unbroken tokens must stay inside the margin.
        for (const c of Array.from(word)) {
          if (line && font.widthOfTextAtSize(line+c,size) > textWidth) {lines.push(line); line = '';}
          line += c;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const write = (value, size = 10, heading = false) => {
    const leading = size*1.45;
    const lines = wrap(value,size);
    if (heading && y < margin+leading*3) newPage();
    for (const line of lines) {
      if (y < margin+leading) newPage();
      page.drawText(line,{x:margin,y:y-size,font,size,color:heading?rgb(0.15,0.2,0.45):rgb(0.12,0.15,0.2)});
      y -= leading;
    }
    y -= heading?8:6;
  };
  const metadata = paper => {
    write(authorNames(paper),9);
    write(`Publication year: ${paper.publication_year ?? 'Unknown'} | DOI: ${paper.doi || 'None'} | arXiv: ${paper.arxiv_id || 'None'}`,9);
  };
  newPage();
  write('Research report',22,true);
  write(data.paper.title,15,true);
  metadata(data.paper);
  write('Saved summaries, annotations, section tags and citations follow. Source page references refer to the original paper before this appendix.',9);
  write(`Summaries: ${data.summaries.length} | Annotations: ${data.annotations.length} | Tags: ${data.tags.length} | Citations: ${data.citations.length}`,9);

  write('Summaries',17,true);
  if (!data.summaries.length) write('No summaries saved for this paper. Generate and save a summary in AI Summaries before exporting.');
  for (const summary of data.summaries) {
    write(`${summary.summary_type} summary`,12,true);
    write(`Model: ${summary.model_name}`,9);
    if (Array.isArray(summary.sections) && summary.sections.length) {
      for (const section of summary.sections) {
        write(section.heading,11,true); write(section.text);
        if (section.sources?.length) write('Sources: '+section.sources.map(region).join('; '),8);
      }
    } else write(summary.summary_text);
    if (summary.key_findings?.length) {
      write('Key findings',11,true);
      for (const finding of summary.key_findings) write('- '+finding);
    }
  }
  write('Annotations',17,true);
  if (!data.annotations.length) write('No annotations saved.');
  data.annotations.forEach((note,i) => {
    write(`Annotation ${i+1} | ${region(note)}`,11,true);
    write(note.content);
    if (note.position_x != null && note.position_y != null) write(`Source region: x=${note.position_x}, y=${note.position_y}, width=${note.region_width ?? 'unknown'}, height=${note.region_height ?? 'unknown'}`,8);
  });
  write('Section tags',17,true);
  if (!data.tags.length) write('No tags saved.');
  for (const tag of data.tags) {
    write(tag.path,11,true);
    write(`Scope: ${tag.kind} | ${region(tag)}`,9);
    write(tag.section || 'Whole paper');
    if (tag.box) write('Source region: '+JSON.stringify(tag.box),8);
  }
  write('Citations',17,true);
  if (!data.citations.length) write('No outgoing citations saved in the citation graph.');
  data.citations.forEach((citation,i) => {
    write(`[${i+1}] ${citation.title}`,11,true); metadata(citation);
    if (citation.citation_context) write(citation.citation_context);
  });
  if (notices.length) {write('Placement notices',14,true); notices.forEach(notice=>write(notice));}
  if (replaced) write('Some characters are outside the bundled font. Their Unicode code points are shown as [U+XXXX]; exact original text remains in the PDF comments and attached research-notes.md file.',9);
}
