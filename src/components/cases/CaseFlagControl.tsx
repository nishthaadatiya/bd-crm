'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { workflowError } from '@/lib/case-workflow';
import { useToast } from '@/components/ui/Toast';
import type { Case, Profile } from '@/types';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';

export default function CaseFlagControl({ caseData, onSuccess }: { caseData: Case; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const flagged = caseData.work_flag && caseData.work_flag !== 'none';
  return <div className="space-y-1">
    <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{flagged ? `${caseData.work_flag === 'blocked' ? 'Blocked' : 'Waiting'} · Edit flag` : 'Waiting / Blocked'}</Button>
    {flagged && <p className="max-w-xs whitespace-normal text-xs text-amber-300">{caseData.flag_reason}{caseData.follow_up_date ? ` · Follow up ${caseData.follow_up_date}` : ''}</p>}
    {open && <FlagForm caseData={caseData} onClose={() => setOpen(false)} onSuccess={onSuccess} />}
  </div>;
}

function FlagForm({ caseData, onClose, onSuccess }: { caseData: Case; onClose: () => void; onSuccess: () => void }) {
  const supabase = createClient();
  const { toast } = useToast();
  const [flag, setFlag] = useState(caseData.work_flag || 'none');
  const [reason, setReason] = useState(caseData.flag_reason || '');
  const [owner, setOwner] = useState(caseData.flag_owner_id || caseData.assigned_to || '');
  const [followUp, setFollowUp] = useState(caseData.follow_up_date || '');
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name');
        if (result.error) throw new Error(result.error.message);
        if (active) setEmployees(result.data as Profile[]);
      } catch { if (active) setError('Could not load employees. Close and reopen to retry.'); }
      finally { if (active) setLoading(false); }
    }
    load(); return () => { active = false; };
  }, [supabase]);
  const close = () => { if (!busy.current) onClose(); };
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const result = await supabase.rpc('set_case_work_flag', {
        p_case_id: caseData.id, p_expected_updated_at: caseData.updated_at, p_flag: flag,
        p_reason: reason.trim(), p_owner_id: flag === 'none' ? null : owner,
        p_follow_up_date: flag === 'none' ? null : followUp,
      });
      if (result.error) throw workflowError(result.error);
      toast(flag === 'none' ? 'Flag resolved' : 'Follow-up saved', 'success'); onSuccess(); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save flag'); }
    finally { busy.current = false; setSaving(false); }
  }
  return <Modal isOpen onClose={close} title={`Waiting / Blocked: ${caseData.case_number}`}>
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-400">Keep the current workflow step while tracking what is preventing progress.</p>
      <Select id="case-flag" label="Work condition" value={flag} onChange={(e) => setFlag(e.target.value as typeof flag)} disabled={saving}
        options={[{ value: 'none', label: 'No flag / Resolve flag' }, { value: 'waiting', label: 'Waiting' }, { value: 'blocked', label: 'Blocked' }]} />
      {flag !== 'none' && <>
        <Textarea id="flag-reason" label="Reason / action needed" required value={reason} onChange={(e) => setReason(e.target.value)} disabled={saving} />
        <Select id="flag-owner" label="Who needs to act?" required placeholder="Select a person" value={owner} disabled={saving || loading}
          onChange={(e) => setOwner(e.target.value)} options={employees.map((employee) => ({ value: employee.id, label: employee.full_name }))} />
        <Input id="flag-followup" label="Next follow-up date" type="date" required value={followUp} onChange={(e) => setFollowUp(e.target.value)} disabled={saving} />
      </>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
        <Button type="submit" isLoading={saving} disabled={loading || (flag !== 'none' && (!reason.trim() || !owner || !followUp))}>Save Flag</Button></div>
    </form>
  </Modal>;
}
