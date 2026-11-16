import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createResearchExportRepository } from '../repositories/researchExport.repository.js';
import { createResearchExport } from '../services/researchExport.service.js';

// Always isolated in a new schema on a localhost test DB. No shared Neon writes.
test('export snapshot includes all tag stores and legacy/structured summaries, excludes other papers, and never mutates data',async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && url.pathname.includes('test'),'local test DB required');
  const schema='fr20_test_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString:url.href});
  let db;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    db=new pg.Pool({connectionString:url.href,options:`-c search_path=${schema},public`});
    for(const file of ['schema.sql','20261019_annotations.sql','20261024_topic_tags.sql','20261024_paper_metadata.sql','20261026_paper_tag_assignments.sql','20261026_paper_tags_and_search.sql','20261027_citations.sql','20261027_paper_sections_and_recommendations.sql','20261116_structured_summaries.sql']) {
      await db.query(await fs.readFile(new URL(`../../../database/${file}`,import.meta.url),'utf8'));
    }
    const user=(await db.query("INSERT INTO users(email,password_hash,full_name) VALUES('fr20@example.edu','test-only','Exporter') RETURNING id")).rows[0].id;
    const insertPaper=async title=>(await db.query(`INSERT INTO papers(title,authors,file_path,file_size_bytes,mime_type,uploader_id,publication_year)
      VALUES($1,ARRAY['Author'],$3,100,'application/pdf',$2,2024) RETURNING id`,[title,user,`uploads/fr20-${randomUUID()}.pdf`])).rows[0].id;
    const id=await insertPaper('Target paper'), other=await insertPaper('Unrelated paper');
    const note=(await db.query(`INSERT INTO annotations(paper_id,created_by,page_number,content,position_x,position_y,region_width,region_height)
      VALUES($1,$2,1,'Selected passage',0.1,0.2,0.3,0.1) RETURNING id`,[id,user])).rows[0].id;
    await db.query("INSERT INTO annotations(paper_id,created_by,page_number,content) VALUES($1,$2,1,'DO NOT EXPORT unrelated note')",[other,user]);
    const root=(await db.query("INSERT INTO topic_tags(name,slug) VALUES('AI','ai') RETURNING id")).rows[0].id;
    const child=(await db.query("INSERT INTO topic_tags(name,slug,parent_id) VALUES('Vision','vision',$1) RETURNING id",[root])).rows[0].id;
    await db.query('INSERT INTO paper_tag_assignments(paper_id,tag_id,annotation_id) VALUES($1,$2,$3)',[id,child,note]);
    await db.query('INSERT INTO paper_tag_assignments(paper_id,tag_id) VALUES($1,$2)',[id,child]);
    await db.query(`INSERT INTO paper_tags(paper_id,tag_id,section_name,page_number,bounding_box) VALUES($1,$2,'Paragraph',2,'{"x":0.2,"y":0.3,"w":0.2,"h":0.1}')`,[id,child]);
    const section=(await db.query("INSERT INTO paper_sections(paper_id,section_title,content,page_number) VALUES($1,'Methods','Section text',3) RETURNING id",[id])).rows[0].id;
    await db.query('INSERT INTO paper_section_tags(paper_id,section_id,tag_id) VALUES($1,$2,$3)',[id,section,child]);
    await db.query("INSERT INTO paper_summaries(paper_id,model_name,summary_text,key_findings) VALUES($1,'legacy','Legacy saved summary',ARRAY['Important finding'])",[id]);
    await db.query("INSERT INTO paper_summaries(paper_id,model_name,summary_type,summary_text) VALUES($1,'structured','brief','Structured text')",[id]);
    const sections=[{heading:'Results',text:'Structured evidence',sources:[{page:1,x:0.1,y:0.2,width:0.3,height:0.1}]}];
    await db.query("INSERT INTO structured_summary_jobs(paper_id,model_name,summary_type,status,sections) VALUES($1,'structured','brief','completed',$2)",[id,JSON.stringify(sections)]);
    await db.query("INSERT INTO citations(citing_paper_id,cited_paper_id,citation_context) VALUES($1,$2,'Reference context')",[id,other]);
    const tables=['papers','annotations','paper_summaries','structured_summary_jobs','topic_tags','paper_tag_assignments','paper_tags','paper_sections','paper_section_tags','citations'];
    const dump=async()=>{
      const out={};
      for(const table of tables)out[table]=(await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
      return out;
    };
    const before=await dump();
    const repo=createResearchExportRepository(db);
    const data=await repo.snapshot(id);
    assert.equal(data.annotations.length,1);
    assert.equal(data.tags.length,4);
    assert.deepEqual(data.tags.map(t=>t.kind).sort(),['annotation','paper','paragraph','section']);
    assert.ok(data.tags.every(t=>t.path==='AI > Vision'));
    assert.equal(data.summaries.length,2);
    assert.deepEqual(data.summaries.find(s=>s.model_name==='structured').sections,sections);
    assert.equal(data.citations.length,1);
    const output=await createResearchExport(id,'markdown',{repository:repo});
    const md=output.buffer.toString('utf8');
    for(const expected of ['Selected passage','Important finding','Legacy saved summary','Structured evidence','Methods','Paragraph','Reference context'])assert.ok(md.includes(expected),expected);
    assert.ok(!md.includes('DO NOT EXPORT'));
    assert.equal(await repo.snapshot(randomUUID()),null);
    assert.deepEqual(await dump(),before,'all source records unchanged by export');
    // A SQL failure rolls back and releases the client; a later export still works.
    await db.query('ALTER TABLE citations RENAME TO citations_unavailable');
    await assert.rejects(repo.snapshot(id),{code:'42P01'});
    await db.query('ALTER TABLE citations_unavailable RENAME TO citations');
    assert.equal((await repo.snapshot(id)).paper.id,id);
  } finally {
    if(db)await db.end();
    // Only this test's generated schema, never application/shared data.
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
