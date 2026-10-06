'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getCaseStatusLabel } from '@/lib/case-status';
import { caseMatchesQueue, taskMatchesQueue, localDateKey, type QueueTab } from '@/lib/work-queue';
import { workflowError } from '@/lib/case-workflow';
import { useToast } from '@/components/ui/Toast';
import CaseHandoffModal from '@/components/cases/CaseHandoffModal';
import CaseFlagControl from '@/components/cases/CaseFlagControl';
import Button from '@/components/ui/Button';
import type { Case, Task } from '@/types';

const tabs: { key: QueueTab; label: string }[] = [
  { key: 'assigned', label: 'Assigned to me' }, { key: 'new', label: 'New handoffs' },
  { key: 'today', label: 'Due today' }, { key: 'overdue', label: 'Overdue' },
];

export default function WorkQueuePage() {
  const supabase = createClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const [cases, setCases] = useState<Case[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState<QueueTab>('assigned');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<Case | null>(null);
  const [today, setToday] = useState(localDateKey());

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      // Fetch every page so a busy employee does not silently lose work at the API row limit.
      const allCases: Case[] = []; const allTasks: Task[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from('cases').select('*, customer:customers(full_name), current_stage:workflow_stages(name)')
          .or(`assigned_to.eq.${user.id},flag_owner_id.eq.${user.id}`).order('stage_due_date', { ascending: true, nullsFirst: false }).order('id').range(offset, offset + 499);
        if (result.error) throw workflowError(result.error);
        allCases.push(...result.data as Case[]); if (result.data.length < 500) break;
      }
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from('tasks').select('*, case:cases(case_number)').eq('assigned_to', user.id)
          .in('status', ['pending', 'in_progress']).order('due_date', { ascending: true, nullsFirst: false }).order('id').range(offset, offset + 499);
        if (result.error) throw new Error(result.error.message);
        allTasks.push(...result.data as Task[]); if (result.data.length < 500) break;
      }
      setCases(allCases); setTasks(allTasks); setError(''); setToday(localDateKey());
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load your work queue'); }
    finally { setLoading(false); }
  }, [supabase, user]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void refresh(); }, 0);
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
    return () => { window.clearTimeout(initialLoad); window.removeEventListener('focus', onFocus); window.clearInterval(timer); };
  }, [refresh]);

  async function accept(c: Case) {
    if (busy) return; setBusy(c.id);
    try {
      const result = await supabase.rpc('accept_case_handoff', { p_case_id: c.id, p_handoff_at: c.handoff_at });
      if (result.error) throw workflowError(result.error);
      toast('Handoff accepted', 'success'); await refresh();
    } catch (err) { toast(err instanceof Error ? err.message : 'Could not accept handoff', 'error'); }
    finally { setBusy(null); }
  }

  const term = search.trim().toLowerCase();
  const filteredCases = cases.filter((c) => caseMatchesQueue(c, tab, user?.id || '', today) && `${c.case_number} ${c.customer?.full_name || ''}`.toLowerCase().includes(term));
  const filteredTasks = tasks.filter((task) => taskMatchesQueue(task, tab, today) && `${task.title} ${task.case?.case_number || ''}`.toLowerCase().includes(term));

  return <div className="max-w-7xl space-y-6">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">My Work Queue</h1><p className="text-sm text-slate-400">Your cases, handoffs, tasks and follow-ups in one place.</p></div><Button variant="secondary" onClick={() => { setLoading(true); void refresh(); }} disabled={loading}>Refresh</Button></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{tabs.map((item) => {
      const count = cases.filter((c) => caseMatchesQueue(c, item.key, user?.id || '', today)).length + tasks.filter((t) => taskMatchesQueue(t, item.key, today)).length;
      return <button key={item.key} aria-pressed={tab === item.key} onClick={() => setTab(item.key)} className={`rounded-xl border p-4 text-left ${tab === item.key ? 'border-indigo-500 bg-indigo-500/15' : 'border-slate-800 bg-slate-900'}`}><span className="block text-sm text-slate-300">{item.label}</span><strong className="text-2xl">{count}</strong><span className="ml-2 text-xs text-slate-500">items</span></button>;
    })}</div>
    <input aria-label="Search your work" placeholder="Search case, customer or task…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3" />
    {error && <p role="alert" className="rounded-lg border border-red-500/30 p-4 text-red-300">{error}</p>}
    {loading ? <p role="status">Loading your work…</p> : !error && <>
      <section className="space-y-3"><h2 className="font-semibold">Cases & follow-ups ({filteredCases.length})</h2>
        {!filteredCases.length && <p className="text-sm text-slate-400">No cases in this view.</p>}
        {filteredCases.map((c) => <article key={c.id} className="flex flex-col justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 md:flex-row">
          <div><Link href={`/cases/${c.id}`} className="font-semibold text-indigo-300">{c.case_number} · {c.customer?.full_name}</Link><p className="text-sm text-slate-300">{getCaseStatusLabel(c.status)}</p>
            <p className="text-xs text-slate-400">Step due: {c.stage_due_date ? localDateKey(new Date(c.stage_due_date)) : 'Not set'}{c.flag_owner_id === user?.id && c.follow_up_date ? ` · Your follow-up: ${c.follow_up_date}` : ''}</p>
            <CaseFlagControl caseData={c} onSuccess={refresh} />
          </div><div className="flex flex-wrap items-center gap-2">
            {c.assigned_to === user?.id && c.handoff_at && !c.handoff_accepted_at && <Button size="sm" variant="secondary" disabled={!!busy} isLoading={busy === c.id} onClick={() => accept(c)}>Accept Handoff</Button>}
            <Button size="sm" onClick={() => setHandoff(c)}>Complete & Handoff</Button>
          </div>
        </article>)}
      </section>
      <section className="space-y-3"><h2 className="font-semibold">Tasks ({filteredTasks.length})</h2>{!filteredTasks.length && <p className="text-sm text-slate-400">No tasks in this view.</p>}
        {filteredTasks.map((task) => <Link key={task.id} href={task.case_id ? `/cases/${task.case_id}` : '/tasks'} className="block rounded-xl border border-slate-800 p-4 hover:bg-slate-800/40"><strong className="text-sm">{task.title}</strong><p className="text-xs text-slate-400">{task.case?.case_number || 'General task'} · Due {task.due_date?.slice(0, 10) || 'not set'}</p></Link>)}
      </section>
    </>}
    {handoff && <CaseHandoffModal key={handoff.id} caseData={handoff} onClose={() => setHandoff(null)} onSuccess={refresh} />}
  </div>;
}
