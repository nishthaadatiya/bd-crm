import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(name, dependencies = {}) {
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8');
  const context = { exports: {}, require: (path) => {
    assert.ok(dependencies[path], `Unexpected dependency ${path}`); return dependencies[path];
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText, context);
  return context.exports;
}
const status = load('case-status');
const { caseMatchesQueue, taskMatchesQueue } = load('work-queue', { './case-status': status });
const { remainingChecks, completeHandoff, workflowError } = load('case-workflow');
const { deleteCaseDocument } = load('document-delete');
const base = { id: 'case', status: 'valuation', assigned_to: 'me', stage_due_date: null };

test('new handoffs remain new until accepted; closed cases leave the queue', () => {
  assert.equal(caseMatchesQueue({ ...base, handoff_at: '2026-10-01' }, 'new', 'me'), true);
  assert.equal(caseMatchesQueue({ ...base, handoff_at: '2026-10-01', handoff_accepted_at: '2026-10-02' }, 'new', 'me'), false);
  assert.equal(caseMatchesQueue({ ...base, status: 'closed' }, 'assigned', 'me'), false);
});
test('follow-ups appear for the action owner without claiming ownership of the case', () => {
  const c = { ...base, assigned_to: 'other', work_flag: 'waiting', flag_owner_id: 'me', follow_up_date: '2026-10-05' };
  assert.equal(caseMatchesQueue(c, 'today', 'me', '2026-10-05'), true);
  assert.equal(caseMatchesQueue(c, 'overdue', 'me', '2026-10-06'), true);
  assert.equal(caseMatchesQueue(c, 'assigned', 'me', '2026-10-05'), false);
  assert.equal(caseMatchesQueue(c, 'today', 'someone-else', '2026-10-05'), false);
});
test('completed and cancelled tasks never appear as overdue', () => {
  for (const status of ['completed','cancelled']) assert.equal(taskMatchesQueue({ status, due_date: '2026-10-01' }, 'overdue','2026-10-05'), false);
  assert.equal(taskMatchesQueue({ status: 'pending', due_date: '2026-10-05' }, 'today','2026-10-05'), true);
});
test('checkboxes satisfy only permitted own tasks, not documents or other employee tasks', () => {
  const checks = [
    { key:'a', done:false, can_complete:true, task_id:'a' },
    { key:'b', done:false, can_complete:false, task_id:'b' },
    { key:'document', done:false, can_complete:false },
    { key:'done', done:true, can_complete:false },
  ];
  assert.equal(remainingChecks(checks,['a','b']).map((check)=>check.key).join(','),'b,document');
});
test('completion uses one RPC and never falls back to unchecked table writes',async()=>{
  const calls=[];
  const client={ rpc: async(name,args)=>{calls.push({name,args}); return {error:{message:'Rejected',code:'P0001'}};} };
  await assert.rejects(completeHandoff(client,{id:'case',updated_at:'version'}, {status:'search',assignedTo:'next',notes:'Done',completeTaskIds:['a'],confirmed:true,overrideReason:''}),/Rejected/);
  assert.equal(calls.length,1); assert.equal(calls[0].args.p_expected_updated_at,'version');
  assert.match(workflowError({code:'PGRST202',message:'Missing'}).message,/supabase-workflow-v6.sql/);
});

test('denied deletion never attempts storage removal', async()=>{
  const client={rpc:async()=>({error:{message:'Not allowed'}}),storage:{from:()=>{throw new Error('Storage must not be called');}}};
  await assert.rejects(deleteCaseDocument(client,'upload','case'),/Not allowed/);
});

test('document deletion removes only the authorized returned storage path', async()=>{
  const paths=[];
  const client = {
    rpc: async () => ({ data: { file_path: 'cases/case/proof.pdf' }, error: null }),
    storage: {
      from: (bucket) => {
        assert.equal(bucket, 'case-documents');
        return { remove: async (values) => {
          paths.push(...values);
          return { data: [{ name: values[0] }], error: null };
        } };
      },
    },
  };
  assert.equal((await deleteCaseDocument(client,'upload','case')).warning,null);
  assert.deepEqual(paths,['cases/case/proof.pdf']);
});

test('storage failure preserves a retry path and reports partial success', async()=>{
  for(const response of [{error:{message:'Denied'},data:null},{error:null,data:[]}]) {
    const client={rpc:async()=>({data:{file_path:'proof.pdf'},error:null}),storage:{from:()=>({remove:async()=>response})}};
    const result=await deleteCaseDocument(client,'upload','case');
    assert.equal(result.cleanupPath,'proof.pdf'); assert.match(result.warning,/cleanup needs attention/);
  }
});
