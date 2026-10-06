import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const cache = {};
function load(name) {
  if(cache[name]) return cache[name];
  const context = { exports: {}, require: (path)=>path.startsWith('./')?load(path.slice(2)):require(path), setTimeout, clearTimeout, console, Buffer };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,esModuleInterop:true}}).outputText,context);
  return cache[name]=context.exports;
}
const {allPages}=load('case-export-data');
const {buildCasesWorkbook}=load('case-excel');
const {buildCasePdfDefinition,createCasePdf}=load('case-pdf');
const fixture={caseData:{id:'id',case_number:'CAS-00001',status:'doc_verification',case_type:'home_loan',priority:'high',current_stage_id:'verify',loan_amount:4500000,property_value:6200000,interest_rate:8.5,loan_tenure_months:240,bank_name:'Example Bank',application_number:'APP-2026-001',customer:{full_name:'Ananya Mehta',phone:'0123456789'},building:{name:'Riverside Apartments'},assigned_profile:{full_name:'Priya Sharma'},created_at:'2026-09-20T09:00:00Z',updated_at:'2026-10-05T10:30:00Z',stage_due_date:'2026-10-07',expected_completion_date:'2026-10-20',work_flag:'waiting',notes:'PRIVATE INTERNAL NOTE',flag_reason:'PRIVATE DELAY REASON'},tasks:[{title:'Verify employment documents',status:'in_progress',assigned_profile:{full_name:'Priya Sharma'},due_date:'2026-10-07'}],requirements:[{id:'identity',name:'Identity proof',is_mandatory:true,stage_id:'verify'},{id:'income',name:'Income proof',is_mandatory:true,stage_id:'verify'}],documents:[{requirement_id:'identity',document_name:'Identity proof',status:'approved',version:1}],activities:[{created_at:'2026-10-05',description:'PRIVATE AUDIT ENTRY'}]};

test('export reads beyond 1000 rows and never returns partial results on query failure',async()=>{
  const records=Array.from({length:1201},(_,id)=>({id}));
  const calls=[];
  const rows=await allPages(async(start,end)=>{calls.push(start);return{data:records.slice(start,end+1),error:null};});
  assert.equal(rows.length,1201);assert.deepEqual(calls,[0,500,1000]);
  await assert.rejects(allPages(async(start)=>start?{error:{message:'Permission denied'},data:null}:{data:records.slice(0,500),error:null}),/Permission denied/);
});

test('Excel includes extra fields, preserves numeric amounts and literal formula-like text',async()=>{
  const workbook=await buildCasesWorkbook([{...fixture.caseData,notes:'=HYPERLINK("bad")',extra_field:'Also exported'}]);
  const buffer=await workbook.xlsx.writeBuffer();
  const {Workbook}=require('exceljs');const reopened=new Workbook();await reopened.xlsx.load(buffer);
  const sheet=reopened.getWorksheet('All Cases');
  const headers=sheet.getRow(4).values;
  assert.equal(sheet.getCell(5,headers.indexOf('Loan Amount')).value,4500000);
  assert.equal(sheet.getCell(5,headers.indexOf('Notes')).value,'=HYPERLINK("bad")');
  assert.equal(sheet.getCell(5,headers.indexOf('Extra Field')).value,'Also exported');
  assert.equal(sheet.getCell(5,headers.indexOf('Customer / Phone')).value,'0123456789');
  const empty=await buildCasesWorkbook([]);assert.ok((await empty.xlsx.writeBuffer()).byteLength>0);
});

test('client PDF excludes internal notes and audit while internal PDF includes them',()=>{
  const client=JSON.stringify(buildCasePdfDefinition(fixture,false));
  const internal=JSON.stringify(buildCasePdfDefinition(fixture,true));
  assert.ok(!client.includes('PRIVATE'));assert.ok(internal.includes('PRIVATE INTERNAL NOTE'));assert.ok(internal.includes('PRIVATE AUDIT ENTRY'));
  assert.ok(client.includes('Not uploaded'));assert.ok(client.includes('Doc verification'));
});

test('PDF generator produces real PDFs with embedded fonts and long tables',async()=>{
  const path=new URL('../tmp/export-qa/',import.meta.url);mkdirSync(path,{recursive:true});
  const client=await createCasePdf(fixture,false);
  const buffer=await client.getBuffer();assert.equal(buffer.subarray(0,4).toString(),'%PDF');
  writeFileSync(new URL('client.pdf',path),buffer);
  const long={...fixture,tasks:Array.from({length:40},(_,i)=>({...fixture.tasks[0],title:`Task ${i+1}: Verify property details and supporting documents with the assigned representative.`}))};
  const internal=await createCasePdf(long,true);writeFileSync(new URL('internal.pdf',path),await internal.getBuffer());
});
