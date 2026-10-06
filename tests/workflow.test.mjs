import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const sql = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
let employee, recipient, manager, customer;
const one = async (query, args = []) => (await db.query(query, args)).rows[0];
async function actor(id) { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']); }
async function freshCase(status = 'lead') {
  await actor(null);
  const c = await one('insert into cases(customer_id,status,assigned_to,case_number) values($1,$2,$3,gen_random_uuid()::text) returning *', [customer, status, employee]);
  await actor(employee); return c;
}
async function handoff(c, status, options = {}) {
  return one('select complete_case_handoff($1,$2,$3,$4,$5,$6,$7,$8) result', [
    c.id, c.updated_at, status, recipient, 'Finished my work', options.tasks || [],
    options.confirmed === undefined ? true : options.confirmed, options.reason || '',
  ]);
}

before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT,raw_user_meta_data JSONB DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION uuid_generate_v4() RETURNS UUID LANGUAGE SQL AS $$ SELECT gen_random_uuid() $$;`);
  await db.exec(sql('supabase-schema.sql').replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', ''));
  await db.exec(sql('supabase-fix-rls.sql'));
  await db.exec(sql('supabase-case-workspace-v3.sql'));
  await db.exec(sql('supabase-case-statuses-v5.sql'));
  await db.exec(sql('supabase-workflow-v6.sql'));
  await db.exec(sql('supabase-workflow-v6.sql')); // Idempotency
  await db.exec('CREATE SCHEMA storage; CREATE TABLE storage.objects(id UUID DEFAULT gen_random_uuid(),bucket_id TEXT,name TEXT,owner_id TEXT); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;');
  await db.exec(sql('supabase-document-delete-v7.sql'));
  await db.exec(sql('supabase-document-delete-v7.sql'));
  for (const [name, role] of [['Manager','manager'],['Employee','employee'],['Recipient','employee']]) {
    const user = await one("insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),$1,jsonb_build_object('full_name',$2::text)) returning id", [`${name}@test.invalid`, name]);
    await db.query('update profiles set role_id=(select id from roles where name=$1) where id=$2',[role,user.id]);
    if (name === 'Manager') manager=user.id;
    else if (name === 'Employee') employee=user.id;
    else recipient=user.id;
  }
  customer=(await one("insert into customers(full_name) values('Test Customer') returning id")).id;
});
after(async () => { await db.close(); });

test('migration installs exactly twelve mapped steps and is rerunnable', async () => {
  assert.equal(Number((await one('select count(*) from workflow_stages where status_code is not null')).count), 12);
});

test('handoff atomically completes own tasks, sets step and owner, creates next tasks and notification', async () => {
  const c=await freshCase();
  const task=await one("insert into tasks(case_id,stage_id,title,assigned_to,status) values($1,$2,'Call customer',$3,'pending') returning id",[c.id,c.current_stage_id,employee]);
  await handoff(c,'doc_collection',{tasks:[task.id]});
  const saved=await one('select * from cases where id=$1',[c.id]);
  assert.equal(saved.status,'doc_collection'); assert.equal(saved.assigned_to,recipient);
  assert.ok(saved.handoff_at); assert.equal(saved.handoff_accepted_at,null);
  assert.equal((await one('select status from tasks where id=$1',[task.id])).status,'completed');
  assert.ok(Number((await one('select count(*) from tasks where case_id=$1 and stage_id=$2',[c.id,saved.current_stage_id])).count)>0);
  assert.equal(Number((await one('select count(*) from notifications where related_case_id=$1',[c.id])).count),1);
  await assert.rejects(handoff(c,'doc_verification'),/changed/);
});

test('required documents use latest version and rejected handoff rolls task completion back',async()=>{
  const c=await freshCase('doc_collection');
  const task=await one("insert into tasks(case_id,stage_id,title,assigned_to) values($1,$2,'Collect Required Documents',$3) returning id",[c.id,c.current_stage_id,employee]);
  const req=await one("insert into document_requirements(stage_id,name) values($1,'Identity proof') returning id",[c.current_stage_id]);
  await db.query("insert into document_uploads(case_id,requirement_id,document_name,original_filename,file_path,status,version) values($1,$2,'ID','id.pdf','id.pdf','approved',1),($1,$2,'ID','id2.pdf','id2.pdf','rejected',2)",[c.id,req.id]);
  await assert.rejects(handoff(c,'doc_verification',{tasks:[task.id]}),/required tasks and documents/);
  assert.equal((await one('select status from tasks where id=$1',[task.id])).status,'pending');
  assert.equal((await one('select status from cases where id=$1',[c.id])).status,'doc_collection');
  await db.query('delete from document_uploads where requirement_id=$1',[req.id]);
  await db.query('delete from document_requirements where id=$1',[req.id]);
});

test('employee cannot override missing work, manager must supply a reason which is audited',async()=>{
  const c=await freshCase();
  await db.query("insert into tasks(case_id,stage_id,title,assigned_to) values($1,$2,'Pending work',$3)",[c.id,c.current_stage_id,employee]);
  await assert.rejects(handoff(c,'doc_collection',{reason:'Please skip'}),/required tasks and documents/);
  await actor(manager);
  await assert.rejects(handoff(c,'doc_collection'),/required tasks and documents/);
  await handoff(c,'doc_collection',{reason:'Customer deadline approved by manager'});
  const activity=await one("select metadata,description from activities where case_id=$1 and action='case_handoff'",[c.id]);
  assert.match(activity.description,/Manager override/);
  assert.equal(activity.metadata.override_reason,'Customer deadline approved by manager');
});

test('direct case workflow writes are rejected, while normal detail edits work',async()=>{
  const c=await freshCase();
  await assert.rejects(db.query("update cases set status='closed' where id=$1",[c.id]),/Complete & Handoff/);
  await db.query("update cases set notes='Customer called' where id=$1",[c.id]);
});

test('flags preserve current step and require reason, owner, date; resolution clears all flag fields',async()=>{
  const c=await freshCase('valuation');
  await assert.rejects(db.query("select set_case_work_flag($1,$2,'blocked','',null,null)",[c.id,c.updated_at]),/Provide a reason/);
  await db.query("select set_case_work_flag($1,$2,'waiting','Awaiting property report',$3,'2026-10-06')",[c.id,c.updated_at,recipient]);
  const flagged=await one('select * from cases where id=$1',[c.id]);
  assert.equal(flagged.status,'valuation'); assert.equal(flagged.current_stage_id,c.current_stage_id);
  assert.equal(flagged.work_flag,'waiting'); assert.equal(flagged.flag_owner_id,recipient);
  await db.query("select set_case_work_flag($1,$2,'none')",[c.id,flagged.updated_at]);
  const cleared=await one('select * from cases where id=$1',[c.id]);
  assert.equal(cleared.flag_reason,null); assert.equal(cleared.follow_up_date,null);
});

test('only recipient can accept a fresh handoff',async()=>{
  const c=await freshCase(); await handoff(c,'doc_collection');
  const saved=await one('select * from cases where id=$1',[c.id]);
  await assert.rejects(db.query('select accept_case_handoff($1,$2)',[c.id,saved.handoff_at]),/no longer assigned/);
  await actor(recipient);
  await db.query('select accept_case_handoff($1,$2)',[c.id,saved.handoff_at]);
  assert.ok((await one('select handoff_accepted_at from cases where id=$1',[c.id])).handoff_accepted_at);
});

test('inactive actors and completing another employee task are rejected',async()=>{
  const c=await freshCase();
  const task=await one("insert into tasks(case_id,stage_id,title,assigned_to) values($1,$2,'Other work',$3) returning id",[c.id,c.current_stage_id,recipient]);
  await assert.rejects(handoff(c,'doc_collection',{tasks:[task.id]}),/Only your own/);
  await actor(null); await assert.rejects(handoff(c,'doc_collection'),/active employee/);
});

test('employees cannot skip required stages and managers must explain skips', async()=>{
  const c=await freshCase();
  await assert.rejects(handoff(c,'closed'),/Only a manager can skip/);
  await actor(manager);
  await assert.rejects(handoff(c,'closed'),/override reason/);
  await handoff(c,'closed',{reason:'Duplicate case; verified with customer'});
  assert.equal((await one('select stage_due_date from cases where id=$1',[c.id])).stage_due_date,null);
});

test('verification requires approved collection documents and its configured checklist', async()=>{
  const c=await freshCase('doc_verification');
  const collection=await one("select id from workflow_stages where status_code='doc_collection'");
  const req=await one("insert into document_requirements(stage_id,name) values($1,'Income proof') returning id",[collection.id]);
  await db.query("insert into document_uploads(case_id,requirement_id,document_name,original_filename,file_path,status) values($1,$2,'Income','income.pdf','income.pdf','uploaded')",[c.id,req.id]);
  const title=(await one('select required_task_title from workflow_stages where id=$1',[c.current_stage_id])).required_task_title;
  const task=await one('insert into tasks(case_id,stage_id,title,assigned_to) values($1,$2,$3,$4) returning id',[c.id,c.current_stage_id,title,employee]);
  await assert.rejects(handoff(c,'property_ips_processing',{tasks:[task.id]}),/required tasks and documents/);
  await db.query("update document_uploads set status='approved' where case_id=$1",[c.id]);
  await handoff(c,'property_ips_processing',{tasks:[task.id]});
});

test('a waiting flag blocks progression until resolved', async()=>{
  const c=await freshCase();
  await db.query("select set_case_work_flag($1,$2,'waiting','Customer callback',$3,'2026-10-06')",[c.id,c.updated_at,employee]);
  const current=await one('select * from cases where id=$1',[c.id]);
  await assert.rejects(handoff(current,'doc_collection'),/required tasks and documents/);
});

test('RPC works under authenticated RLS permissions and rejects anonymous execution', async()=>{
  const c=await freshCase();
  await db.exec('GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated; SET ROLE authenticated;');
  try { await handoff(c,'doc_collection'); } finally { await db.exec('RESET ROLE'); }
  await db.exec('SET ROLE anon');
  try { await assert.rejects(handoff(c,'doc_collection'),/permission denied/); }
  finally { await db.exec('RESET ROLE'); }
});

async function uploadFor(c, uploader, version = 1, requirement = null) {
  return one("insert into document_uploads(case_id,requirement_id,document_name,original_filename,file_path,uploaded_by,version) values($1,$2,'Wrong file','wrong.pdf',$3,$4,$5) returning *",
    [c.id, requirement, `cases/${c.id}/v${version}_wrong.pdf`, uploader, version]);
}

test('uploader can delete only selected version and the deletion is audited', async()=>{
  const c=await freshCase();
  const first=await uploadFor(c,employee,1);
  const second=await uploadFor(c,employee,2);
  const result=await one('select delete_case_document($1,$2) result',[second.id,c.id]);
  assert.equal(result.result.file_path,second.file_path);
  assert.equal(Number((await one('select count(*) from document_uploads where id=$1',[second.id])).count),0);
  assert.equal(Number((await one('select count(*) from document_uploads where id=$1',[first.id])).count),1);
  const log=await one("select metadata from activities where case_id=$1 and action='document_deleted'",[c.id]);
  assert.equal(log.metadata.upload_id,second.id);
  assert.equal(log.metadata.version,2);
});

test('another employee cannot delete an upload, but manager can', async()=>{
  const c=await freshCase(); const upload=await uploadFor(c,recipient);
  await assert.rejects(db.query('select delete_case_document($1,$2)',[upload.id,c.id]),/only delete your own/);
  assert.equal(Number((await one('select count(*) from document_uploads where id=$1',[upload.id])).count),1);
  await actor(manager); await db.query('select delete_case_document($1,$2)',[upload.id,c.id]);
});

test('missing or mismatched document fails without deleting another case file', async()=>{
  const c=await freshCase(); const other=await freshCase(); const upload=await uploadFor(c,employee);
  await assert.rejects(db.query('select delete_case_document($1,$2)',[upload.id,other.id]),/no longer exists/);
  assert.equal(Number((await one('select count(*) from document_uploads where id=$1',[upload.id])).count),1);
});

test('deleting the only required upload makes its completion check incomplete', async()=>{
  const c=await freshCase('doc_collection');
  const req=await one("insert into document_requirements(stage_id,name) values($1,'Delete test proof') returning id",[c.current_stage_id]);
  const upload=await uploadFor(c,employee,1,req.id);
  const before=(await one('select case_completion_checks($1) checks',[c.id])).checks;
  assert.equal(before.find((check)=>check.key===req.id).done,true);
  await db.query('select delete_case_document($1,$2)',[upload.id,c.id]);
  const after=(await one('select case_completion_checks($1) checks',[c.id])).checks;
  assert.equal(after.find((check)=>check.key===req.id).done,false);
});
