import { PDFDocument, PDFName, PDFHexString } from 'pdf-lib';
import { appendResearchReport } from './researchExportReport.service.js';

// Stored regions use the rendered page's top-left origin. PDF annotations use
// unrotated user space, including crop-box offsets (not just page dimensions).
export function pdfRegion(page, box) {
  if (!box || ['x','y','w','h'].some(k => box[k] === null || box[k] === undefined || !Number.isFinite(Number(box[k])))) return null;
  const {x,y,w,h} = Object.fromEntries(Object.entries(box).map(([k,v]) => [k,Number(v)]));
  if (x < 0 || y < 0 || x >= 1 || y >= 1 || w <= 0 || h <= 0) return null;
  const crop = page.getCropBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const point = (u,v) => {
    const [a,b] = rotation === 90 ? [v,u] : rotation === 180 ? [1-u,v] : rotation === 270 ? [1-v,1-u] : [u,1-v];
    return [crop.x+a*crop.width, crop.y+b*crop.height];
  };
  const corners = [[x,y],[Math.min(1,x+w),y],[x,Math.min(1,y+h)],[Math.min(1,x+w),Math.min(1,y+h)]].map(([u,v]) => point(u,v));
  return [Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[1]))];
}

export async function buildAnnotatedPdf(original, data, attachments) {
  const doc = await PDFDocument.load(original, {updateMetadata:false});
  const pages = doc.getPages();
  if (!pages.length || pages.length > 150) throw Object.assign(new Error('Annotated PDF exports support 1–150 pages.'), {statusCode:422});
  const add = (pageNumber, content, label, box) => {
    const page = pages[pageNumber-1];
    if (!page) return false;
    const region = pdfRegion(page, box);
    const crop = page.getCropBox();
    const rect = region || [crop.x+8,crop.y+crop.height-30,crop.x+28,crop.y+crop.height-10];
    const [x1,y1,x2,y2] = rect;
    const annotation = doc.context.obj({
      Type:'Annot', Subtype:region?'Highlight':'Text', Rect:rect,
      Contents:PDFHexString.fromText(content), T:PDFHexString.fromText(label),
      C:[1,0.8,0], CA:0.4, F:4, P:page.ref,
      ...(region ? {QuadPoints:[x1,y2,x2,y2,x1,y1,x2,y1]} : {Name:'Comment', Open:false}),
    });
    if (!page.node.Annots()) page.node.set(PDFName.of('Annots'), doc.context.obj([]));
    page.node.Annots().push(doc.context.register(annotation));
    return true;
  };
  const unplaced = [];
  for (const a of data.annotations) {
    if (!add(a.page_number, a.content, `Annotation ${a.id}`, {x:a.position_x,y:a.position_y,w:a.region_width,h:a.region_height})) {
      unplaced.push(`Annotation ${a.id}: saved page ${a.page_number} is outside this PDF.`);
    }
  }
  for (const t of data.tags) {
    if (t.page_number && !add(t.page_number, `${t.path}\n${t.section || ''}`, 'Section tag', t.box)) {
      unplaced.push(`Tag ${t.path}: saved page ${t.page_number} is outside this PDF.`);
    }
  }
  // Unicode text lives in native PDF comments (UTF-16), independent of installed fonts.
  // Full notes also travel as embedded, portable UTF-8 files. No source pages are replaced.
  add(1, attachments.markdown + (unplaced.length ? '\n\nPlacement notices:\n'+unplaced.join('\n') : ''), 'Research export: notes, summaries, tags and citations');
  await doc.attach(Buffer.from(attachments.markdown,'utf8'), 'research-notes.md', {mimeType:'text/markdown', description:'Complete research notes, saved summaries, section tags, citations and source coordinates.'});
  await doc.attach(Buffer.from(attachments.bibtex,'utf8'), 'references.bib', {mimeType:'application/x-bibtex', description:'Paper, outgoing references and research notes in BibTeX.'});
  await appendResearchReport(doc, data, unplaced);
  return Buffer.from(await doc.save());
}
