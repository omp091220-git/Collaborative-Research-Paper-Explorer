import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFHexString, degrees } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { createResearchExportRouter } from '../routes/researchExport.routes.js';
import { createResearchExport, toMarkdown, toBibtex } from '../services/researchExport.service.js';
import { buildAnnotatedPdf } from '../services/researchExportPdf.service.js';
import { errorHandler } from '../middleware/errorHandler.js';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const data = {
  paper:{id,title:'A {literal} title & café', authors:['Doe, Jane','Research Group'],publication_year:2024,doi:'10.1234/test', arxiv_id:'1512.03385'},
  annotations:[{id:'note',page_number:1,content:'Unicode 中文 — **note** $x^2$ ```\n<script>no</script>',position_x:0.1,position_y:0.2,region_width:0.3,region_height:0.1}],
  summaries:[{summary_type:'brief',model_name:'saved-model',summary_text:'Legacy fallback',sections:[{heading:'Results',text:'Supported result.',sources:[{page:1,x:0.1,y:0.2,width:0.3,height:0.1}]}]}],
  tags:[{path:'AI > Vision',kind:'section',page_number:1,section:'Methods',box:{x:0.1,y:0.2,w:0.3,h:0.1}}],
  citations:[{id:other,title:'Reference',authors:['Smith, Alex'],publication_year:null,citation_context:'Reference context.'}],
};

test('Markdown preserves all research content, Unicode, LaTeX, hierarchy, provenance and source geometry', () => {
  const md = toMarkdown(data);
  for (const expected of ['中文','**note** $x^2$', '````text', 'AI > Vision','Methods','Supported result.','saved-model','"page": 1','Reference context.','Publication year: Unknown']) assert.ok(md.includes(expected),expected);
  const empty = toMarkdown({paper:data.paper,annotations:[],summaries:[],tags:[],citations:[]});
  for (const field of ['annotations','summaries','tags','citations']) assert.match(empty,new RegExp(`No ${field} saved`));
  assert.ok(!md.includes('2026'),'upload year must not be invented as publication year');
});

test('BibTeX contains unique bibliography entries and escaped research notes without injectable braces', () => {
  const bib = toBibtex(data);
  assert.equal((bib.match(/^@misc/gm)||[]).length,2);
  assert.match(bib,/author = \{Doe, Jane and Research Group\}/);
  assert.match(bib,/title = \{A \\\{literal\\\} title \\& café\}/);
  assert.match(bib,/year = \{2024\}/);
  assert.ok(bib.includes('annote = {'));
  assert.ok(bib.includes('AI > Vision'));
  const attack = toBibtex({...data,paper:{...data.paper,title:'} ,\n@article{attack, title={fake'}});
  assert.equal((attack.match(/^@/gm)||[]).length,2);
  assert.match(attack,/\\\}/);
});

test('annotated PDFs preserve pages, existing comments, Unicode, embedded notes and rotation/crop geometry', async () => {
  const original = await PDFDocument.create();
  for (const angle of [0,90,180,270]) {
    const page = original.addPage([400,600]);
    page.setCropBox(20,30,200,300); page.setRotation(degrees(angle));
    page.drawText('Original research evidence',{x:30,y:200,size:8});
  }
  const existing = original.context.obj({Type:'Annot',Subtype:'Text',Rect:[30,40,50,60],Contents:PDFHexString.fromText('Existing comment')});
  original.getPages()[0].node.set(original.context.obj('Annots'),original.context.obj([original.context.register(existing)]));
  const all = {...data,annotations:[...data.annotations,...[2,3,4].map(page_number=>({...data.annotations[0],page_number})),{...data.annotations[0],page_number:99}]};
  const markdown=toMarkdown(all),bibtex=toBibtex(all);
  const bytes=await buildAnnotatedPdf(await original.save(),all,{markdown,bibtex});
  const pdf=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false}).promise;
  try {
    assert.ok(pdf.numPages > 4, 'Visible research report follows the four original pages');
    for (let n=1;n<=4;n++) {
      const page=await pdf.getPage(n);
      assert.ok((await page.getTextContent()).items.some(i=>i.str==='Original research evidence'));
      const notes=await page.getAnnotations();
      const highlight=notes.find(a=>a.subtype==='Highlight' && a.contentsObj.str===data.annotations[0].content);
      assert.ok(highlight,`Unicode highlight on page ${n}`);
      const viewport=page.getViewport({scale:1});
      const rect=viewport.convertToViewportRectangle(highlight.rect);
      const x=Math.min(rect[0],rect[2])/viewport.width, y=Math.min(rect[1],rect[3])/viewport.height;
      assert.ok(Math.abs(x-0.1)<1e-6 && Math.abs(y-0.2)<1e-6,`rotation ${page.rotate}: ${x}, ${y}`);
      if(n===1) {
        assert.ok(notes.some(a=>a.contentsObj?.str==='Existing comment'));
        assert.ok(notes.some(a=>a.contentsObj?.str.includes('saved page 99 is outside this PDF')));
      }
    }
    let visibleReport = '';
    for (let n=5;n<=pdf.numPages;n++) visibleReport += (await (await pdf.getPage(n)).getTextContent()).items.map(i=>i.str).join(' ')+' ';
    for (const expected of ['Research report','Summaries','Supported result.','Annotations','Section tags','AI > Vision','Methods','Citations','Reference context.','café']) {
      assert.ok(visibleReport.includes(expected), `Visible PDF report includes ${expected}`);
    }
    const files=await pdf.getAttachments();
    assert.equal(Buffer.from(files['research-notes.md'].content).toString('utf8'),markdown);
    assert.equal(Buffer.from(files['references.bib'].content).toString('utf8'),bibtex);
  } finally {await pdf.destroy();}
});

test('PDF exports keep page-only notes, clamp edge regions, and refuse invalid original PDFs', async () => {
  const pdf=await PDFDocument.create(); pdf.addPage();
  const minimal={...data,annotations:[{id:'plain',page_number:1,content:'Page-only note'},
    {...data.annotations[0],content:'Edge region',position_x:0.95,position_y:0.95,region_width:0.3,region_height:0.2}],tags:[]};
  const bytes=await buildAnnotatedPdf(await pdf.save(),minimal,{markdown:toMarkdown(minimal),bibtex:toBibtex(minimal)});
  const reader=await pdfjs.getDocument({data:new Uint8Array(bytes)}).promise;
  try {
    const page=await reader.getPage(1), notes=await page.getAnnotations();
    assert.ok(notes.some(a=>a.subtype==='Text' && a.contentsObj.str==='Page-only note'));
    const edge=notes.find(a=>a.contentsObj.str==='Edge region');
    const viewport=page.getViewport({scale:1});
    const r=viewport.convertToViewportRectangle(edge.rect);
    assert.ok(r.every(Number.isFinite));
    // PDF.js exposes QuadPoints as float32; permit sub-millipoint rounding.
    assert.ok(Math.min(r[0],r[2]) >= -0.001 && Math.max(r[0],r[2]) <= viewport.width+0.001,JSON.stringify({r,width:viewport.width}));
    assert.ok(Math.min(r[1],r[3]) >= -0.001 && Math.max(r[1],r[3]) <= viewport.height+0.001);
  }
  finally {await reader.destroy();}
  const repo={snapshot:async()=>data};
  await assert.rejects(createResearchExport(id,'pdf',{repository:repo,readPdf:async()=>Buffer.from('not a PDF')}),{statusCode:422});
});


test('visible PDF report paginates long notes without clipping and makes empty categories explicit', async () => {
  const source=await PDFDocument.create(); source.addPage().drawText('Source page');
  const long='verylongtoken'.repeat(80)+' '+('Long saved annotation with readable evidence. '.repeat(1400))+' END_OF_NOTE';
  const content={paper:data.paper,annotations:[{id:'long',page_number:1,content:long}],summaries:[],tags:[],citations:[]};
  const bytes=await buildAnnotatedPdf(await source.save(),content,{markdown:toMarkdown(content),bibtex:toBibtex(content)});
  const reader=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false}).promise;
  try {
    assert.ok(reader.numPages > 3);
    let text='';
    for(let n=2;n<=reader.numPages;n++) {
      const page=await reader.getPage(n), viewport=page.getViewport({scale:1});
      for(const item of (await page.getTextContent()).items) {
        text += item.str+' ';
        if(!item.str.trim()) continue;
        const x=item.transform[4], y=item.transform[5];
        assert.ok(x>=47 && x+item.width<=viewport.width-46,'Text stays inside horizontal margins');
        assert.ok(y>=24 && y<=viewport.height-47,'Text stays inside vertical margins');
      }
    }
    for(const expected of ['END_OF_NOTE','No summaries saved','No tags saved','No outgoing citations saved']) assert.ok(text.includes(expected), expected);
  } finally {await reader.destroy();}
});

test('text exports work without a PDF or AI key; formats and missing papers fail clearly', async () => {
  let reads=0;
  const deps={repository:{snapshot:async()=>data},readPdf:async()=>{reads++; throw new Error('Unavailable');}};
  for (const format of ['markdown','bibtex']) {
    const result=await createResearchExport(id,format,deps);
    assert.ok(result.buffer.length>100);assert.ok(!/[\r\n/\\]/.test(result.filename));
  }
  assert.equal(reads,0);
  await assert.rejects(createResearchExport(id,'zip',deps),{statusCode:400});
  await assert.rejects(createResearchExport(id,'markdown',{repository:{snapshot:async()=>null}}),{statusCode:404});
});

test('authenticated students, researchers and admins can download; invalid, anonymous and unavailable requests fail', async () => {
  const original=pool.query;
  let role='STUDENT', calls=0, failure=null;
  pool.query=async()=>({rows:[{id:other,role}]});
  const app=express();
  app.use('/api/papers/:paperId',createResearchExportRouter(async(paperId,format)=>{
    calls++; if(failure)throw failure;
    return createResearchExport(paperId,format,{repository:{snapshot:async()=>paperId===id?data:null}});
  }));
  app.use(errorHandler);
  const route=`/api/papers/${id}/export?format=markdown`;
  try {
    assert.equal((await request(app).get(route)).status,401);assert.equal(calls,0);
    for (role of ['STUDENT','RESEARCHER','SYSTEM_ADMIN']) {
      const token=jwt.sign({id:other,role},process.env.JWT_SECRET);
      const result=await request(app).get(route).set('Authorization',`Bearer ${token}`);
      assert.equal(result.status,200);assert.match(result.headers['content-type'],/text\/markdown/);
      assert.match(result.headers['content-disposition'],/attachment; filename=/);
      assert.equal(result.headers['cache-control'],'private, no-store');
    }
    const token=jwt.sign({id:other,role},process.env.JWT_SECRET);
    const get=url=>request(app).get(url).set('Authorization',`Bearer ${token}`);
    assert.equal((await get('/api/papers/invalid/export?format=markdown')).status,400);
    assert.equal((await get(`/api/papers/${other}/export?format=markdown`)).status,404);
    assert.equal((await get(`/api/papers/${id}/export?format=invalid`)).status,400);
    failure=Object.assign(new Error('reset'),{code:'ECONNRESET'});
    assert.equal((await get(route)).status,503);
    failure=Object.assign(new Error('missing schema'),{code:'42P01'});
    assert.match((await get(route)).body.error,/migrations/);
  } finally {pool.query=original;}
});
