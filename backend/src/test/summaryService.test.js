import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEADINGS, validateSummary, generateSummary, processSummaryJob, extractSources, readPaperPdf } from '../services/summary.service.js';
import { buildSummaryPdfBuffer } from '../utils/summaryPdfBuilder.js';
const sources=[{id:'s0',text:'Evidence from paper',page:1,x:0.1,y:0.2,width:0.5,height:0.02}];
const response=()=>({sections:HEADINGS.map(heading=>({heading,text:'Supported finding.',source_ids:['s0']}))});
test('validates four sections and replaces IDs with real PDF coordinates',()=>{
 const sections=validateSummary(response(),sources);
 assert.deepEqual(sections.map(s=>s.heading),HEADINGS);
 assert.deepEqual(sections[0].sources[0],{id:'s0',page:1,x:0.1,y:0.2,width:0.5,height:0.02});
});
test('rejects invented citations, missing sections and uncited claims',()=>{
 for(const change of [r=>r.sections.pop(),r=>r.sections[0].source_ids=['invented'],r=>r.sections[0].source_ids=[],r=>r.sections[0].heading='Conclusion']) {
  const r=response();change(r);assert.throws(()=>validateSummary(r,sources),/INVALID_AI_RESPONSE/);
 }
 const r=response();r.sections[3]={heading:'Limitations',text:'Not reported in the paper.',source_ids:[]};
 assert.equal(validateSummary(r,sources)[3].sources.length,0);
});
test('real PDF extraction returns normalized one-based page coordinates',async()=>{
 const pdf=buildSummaryPdfBuffer({paperTitle:'A test PDF',authors:['Tester'],summaryText:'Background: solar research. Methodology: trial. Results: improved output. Limitations: one site.',keyFindings:[],citations:[],sourceInfo:{source:'Test'}});
 const items=await extractSources(pdf);
 assert.ok(items.length>0);
 assert.ok(items.every(s=>s.page>=1&&s.x>=0&&s.y>=0&&s.x+s.width<=1&&s.y+s.height<=1));
 assert.ok(items.some(s=>s.text.includes('solar')));
});
test('PDF reader rejects outside paths and generated reports as original source material',async()=>{
 await assert.rejects(readPaperPdf('backend/package.json'),/INVALID_PDF_PATH/);
 const fs=await import('node:fs/promises');
 const {randomUUID}=await import('node:crypto');
 const name=`fr08-report-test-${randomUUID()}.pdf`;
 const url=new URL(`../../../uploads/${name}`,import.meta.url);
 await fs.writeFile(url,buildSummaryPdfBuffer({paperTitle:'Generated report',summaryText:'Metadata only.',authors:[],keyFindings:[],citations:[]}));
 try {await assert.rejects(readPaperPdf({file_path:`uploads/${name}`,arxiv_id:null}),/ORIGINAL_PDF_REQUIRED/);}
 finally {await fs.unlink(url);}
});
test('provider contract, incomplete output, rate limit and permanent failure',async()=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-only';
 try {
  const sections=await generateSummary(sources,'technical','test-model',async(url,options)=>{
   assert.ok(url.includes('test-model:generateContent'));
   assert.equal(options.headers['x-goog-api-key'],'test-only');
   const body=JSON.parse(options.body);assert.match(body.systemInstruction.parts[0].text,/technical/);
   assert.deepEqual(JSON.parse(body.contents[0].parts[0].text),[{id:'s0',text:'Evidence from paper'}]);
   return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(response())}]}}]})};
  });
  assert.equal(sections.length,4);
  await assert.rejects(generateSummary(sources,'brief','test-model',async()=>({ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS'}]})})),/INVALID_AI_RESPONSE/);
  await assert.rejects(generateSummary(sources,'brief','test-model',async()=>({ok:false,status:429})),e=>e.retryable&&e.code==='AI_RATE_LIMITED');
  await assert.rejects(generateSummary(sources,'brief','test-model',async()=>({ok:false,status:403})),e=>!e.retryable);
 } finally {if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}
});
test('duplicate PDFs bypass extraction and AI using cached sections',async()=>{
 const sections=validateSummary(response(),sources);let completed=false;
 await processSummaryJob({paper_id:'paper',summary_type:'brief',model_name:'model'},{
  repository:{paperFile:async()=> 'path',withContentLock:async(k,fn)=>fn({}),readCache:async()=>sections,
   complete:async(c,j,hash,result)=>{assert.equal(hash.length,64);assert.equal(result,sections);completed=true;},fail:async()=>assert.fail('unexpected failure')},
  readPdf:async()=>Buffer.from('identical PDF'),extract:()=>assert.fail('cache bypass'),generate:()=>assert.fail('cache bypass'),
 });assert.ok(completed);
});
test('worker persists only safe retryable error codes',async()=>{
 let failure;
 await processSummaryJob({paper_id:'paper'},{repository:{paperFile:async()=>{throw new TypeError('secret detail');},fail:async(...args)=>{failure=args;}}});
 assert.equal(failure[1],'SUMMARY_FAILED');assert.equal(failure[2],true);
});

test('rotated PDF pages retain source anchor geometry',async()=>{
 const pdf=buildSummaryPdfBuffer({paperTitle:'Rotation',authors:['Tester'],summaryText:'Rotation evidence.',keyFindings:[],citations:[],sourceInfo:{source:'Test'}});
 const original=await extractSources(pdf);
 const rotated=await extractSources(Buffer.from(pdf.toString('latin1').replaceAll('/MediaBox','/Rotate 90 /MediaBox'),'latin1'));
 const a=original.find(s=>s.text.includes('Rotation evidence'));
 const b=rotated.find(s=>s.text.includes('Rotation evidence'));
 assert.ok(a&&b);
 assert.ok(Math.abs(a.width-b.height)<0.001);
 assert.ok(Math.abs(a.height-b.width)<0.001);
});

test('arXiv source retrieval uses only validated IDs and rejects failed/non-PDF responses',async()=>{
 const { downloadOriginalArxiv } = await import('../services/summary.service.js');
 for(const id of ['https://example.com/private','../../etc/passwd','1512.03385?secret=1']) {
  await assert.rejects(downloadOriginalArxiv(id,()=>assert.fail('invalid IDs must not reach network')),/INVALID_ARXIV_ID/);
 }
 const bytes=await downloadOriginalArxiv('1512.03385',async url=>{
  assert.equal(url,'https://arxiv.org/pdf/1512.03385.pdf');
  return new Response(Buffer.from('%PDF-1.7 original paper'));
 });
 assert.ok(bytes.toString().includes('original paper'));
 await assert.rejects(downloadOriginalArxiv('1512.03385',async()=>new Response('<html>Unavailable</html>')),/INVALID_SOURCE_PDF/);
 await assert.rejects(downloadOriginalArxiv('1512.03385',async()=>new Response('',{status:503})),e=>e.code==='SOURCE_DOWNLOAD_FAILED'&&e.retryable);
});

test('configured uploads enqueue comprehensive summaries using their existing transaction client',async()=>{
 const { insertPaperWithJob }=await import('../repositories/paper.repository.js');
 const previous=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-only';
 const queries=[];
 try {
  await insertPaperWithJob({client:{query:async(sql,args)=>{
   queries.push({sql,args});return {rows:[{id:sql.includes('INSERT INTO papers')?'paper-id':'extraction-id'}]};
  }},paperData:{title:'Evidence',authors:['Tester'],filePath:'uploads/original.pdf',fileSizeBytes:100,mimeType:'application/pdf',uploaderId:'user'}});
  const summary=queries.find(q=>q.sql.includes('INSERT INTO structured_summary_jobs'));
  assert.ok(summary);assert.equal(summary.args[0],'paper-id');
 } finally {if(previous===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previous;}
});

test('validated provider responses report actual usage metadata for existing GenAI monitoring',async()=>{
 const previous=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-only';let recorded;
 try {
  await generateSummary(sources,'comprehensive','test-model',async()=>({ok:true,json:async()=>({
   candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(response())}]}}],
   usageMetadata:{promptTokenCount:123,candidatesTokenCount:45},
  })}),async usage=>{recorded=usage;});
  assert.deepEqual(recorded,{promptTokens:123,completionTokens:45,isEstimated:false});
 } finally {if(previous===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previous;}
});
