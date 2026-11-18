import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractSources, generateSummary, validateSummary, HEADINGS, SUMMARY_PDF_LIMITS } from '../services/summary.service.js';

// Real PDF text inside the page boundaries, not a parser mock or truncated fixture.
async function paper(pages) {
 const doc=await PDFDocument.create(), font=await doc.embedFont(StandardFonts.Helvetica);
 const text='Measured evidence '.repeat(6);
 for(let n=0;n<pages;n++) {
  const page=doc.addPage([595,842]);
  for(let line=0;line<50;line++)page.drawText(text,{x:20,y:800-line*15,font,size:7});
  page.drawText(`FINAL_PASSAGE_PAGE_${n+1}`,{x:20,y:25,font,size:7});
 }
 return Buffer.from(await doc.save());
}

test('a paper over the old 100k character limit retains its final passage and usable source anchors',async()=>{
 const sources=await extractSources(await paper(25));
 assert.ok(sources.reduce((sum,s)=>sum+s.text.length,0)>100000);
 const last=sources.find(s=>s.text==='FINAL_PASSAGE_PAGE_25');
 assert.ok(last);assert.equal(last.page,25);
 assert.ok(last.x>=0 && last.y>=0 && last.x+last.width<=1 && last.y+last.height<=1);
 assert.equal(new Set(sources.map(s=>s.id)).size,sources.length);
 const resolved=validateSummary({sections:HEADINGS.map(heading=>({heading,text:'Last-page evidence.',source_ids:[last.id]}))},sources);
 assert.equal(resolved[0].sources[0].page,25);
 // The real provider request includes the final page too; source text is not cut to fit.
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-only';
 try {
  await generateSummary(sources,'technical','model',async(url,options)=>{
   const evidence=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
   assert.equal(evidence.length,sources.length);
   assert.ok(evidence.some(s=>s.id===last.id && s.text===last.text));
   return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({sections:HEADINGS.map(heading=>({heading,text:'Last-page evidence.',source_ids:[last.id]}))})}]}}]})};
  });
 }finally{if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}
});

test('the expanded extraction cap still rejects oversized text without returning a partial paper',async()=>{
 await assert.rejects(extractSources(await paper(100)),e=>e.code==='PDF_TEXT_TOO_LONG'&&!e.retryable);
 assert.equal(SUMMARY_PDF_LIMITS.textChars,500000);
});

test('escaped source payloads are bounded before Gemini is called',async()=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-only';
 try {
  const sources=[{id:'s0',text:'\n'.repeat(800000)}];
  await assert.rejects(generateSummary(sources,'brief','model',async()=>assert.fail('oversize request must not reach Gemini')),e=>e.code==='AI_INPUT_TOO_LONG'&&!e.retryable);
 }finally{if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}
});
