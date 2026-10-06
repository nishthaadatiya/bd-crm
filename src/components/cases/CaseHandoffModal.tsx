'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CASE_STATUS_OPTIONS, getCaseStatusLabel, normalizeCaseStatus } from '@/lib/case-status';
import { completeHandoff, loadCompletionChecks, remainingChecks, type CompletionCheck } from '@/lib/case-workflow';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import type { Case, Profile, WorkflowStage } from '@/types';

export default function CaseHandoffModal({ caseData, onClose, onSuccess, initialStatus }: {
  caseData: Case; onClose: () => void; onSuccess: () => void; initialStatus?: string;
}) {
  const supabase = createClient();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const index = CASE_STATUS_OPTIONS.findIndex((option) => option.value === normalizeCaseStatus(caseData.status));
  const [status, setStatus] = useState(initialStatus || CASE_STATUS_OPTIONS[Math.min(index + 1, 11)]?.value || 'lead');
  const [assignedTo, setAssignedTo] = useState(caseData.assigned_to || '');
  const [notes, setNotes] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [checks, setChecks] = useState<CompletionCheck[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const manager = role === 'owner' || role === 'manager';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [employeesResult, stageResult, completion] = await Promise.all([
          supabase.from('profiles').select('id, full_name, email').eq('is_active', true).order('full_name'),
          supabase.from('workflow_stages').select('*').eq('is_active', true),
          loadCompletionChecks(supabase, caseData.id),
        ]);
        if (employeesResult.error) throw new Error(employeesResult.error.message);
        if (stageResult.error) throw new Error(stageResult.error.message);
        if (!cancelled) {
          setEmployees(employeesResult.data as Profile[]);
          setStages(stageResult.data as WorkflowStage[]);
          setChecks(completion);
          const sourceCode = stageResult.data.find((stage) => stage.id === caseData.current_stage_id)?.status_code;
          const sourceIndex = index >= 0 ? index : CASE_STATUS_OPTIONS.findIndex((option) => option.value === sourceCode);
          const suggestedStatus = initialStatus || CASE_STATUS_OPTIONS[Math.min(sourceIndex + 1, 11)]?.value;
          if (suggestedStatus) setStatus(suggestedStatus);
          const suggestion = stageResult.data.find((s) => s.status_code === suggestedStatus)?.default_assigned_employee_id;
          if (suggestion && employeesResult.data.some((employee) => employee.id === suggestion)) setAssignedTo(suggestion);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load completion requirements.');
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [supabase, caseData.id, caseData.current_stage_id, initialStatus, index]);

  const target = stages.find((stage) => stage.status_code === status);
  const moving = status !== caseData.status || target?.id !== caseData.current_stage_id;
  const unmet = remainingChecks(checks, selectedTasks);
  const sourceIndex = index >= 0 ? index : CASE_STATUS_OPTIONS.findIndex((option) => option.value === stages.find((stage) => stage.id === caseData.current_stage_id)?.status_code);
  const targetIndex = CASE_STATUS_OPTIONS.findIndex((option) => option.value === status);
  const skipping = targetIndex !== sourceIndex && targetIndex !== sourceIndex + 1;
  const needsOverride = moving && (unmet.length > 0 || skipping);
  const blocked = needsOverride && (!manager || overrideReason.trim().length < 5);
  const close = () => { if (!submitting.current) onClose(); };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!user || submitting.current || loading || loadError || blocked || !assignedTo || !target || (moving && !confirmed)) return;
    submitting.current = true; setSaving(true); setError('');
    try {
      await completeHandoff(supabase, caseData, {
        status, assignedTo, notes: notes.trim(), completeTaskIds: selectedTasks,
        confirmed, overrideReason: needsOverride ? overrideReason.trim() : '',
      });
      toast(moving ? 'Step completed and case handed off' : 'Assignment updated', 'success');
      onSuccess(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Handoff failed. No changes were saved.');
    } finally { submitting.current = false; setSaving(false); }
  }

  return (
    <Modal isOpen onClose={close} title={`Complete & Handoff: ${caseData.case_number}`} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-400">Current step: <strong className="text-white">{getCaseStatusLabel(caseData.status)}</strong>. Complete your work and choose who handles the case next.</p>
        {loading && <p role="status">Loading completion requirements…</p>}
        {loadError && <p role="alert" className="text-red-400">{loadError}</p>}
        {!loading && !loadError && <fieldset disabled={saving} className="space-y-2 rounded-lg border border-slate-700 p-4">
          <legend className="px-2 text-sm font-medium">Current step requirements</legend>
          {!checks.length && <p className="text-sm text-slate-400">No document or task requirements configured for this step.</p>}
          {checks.map((check) => <label key={check.key} className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 accent-indigo-500" checked={check.done || (!!check.task_id && selectedTasks.includes(check.task_id))}
              disabled={check.done || !check.can_complete || saving}
              onChange={(event) => setSelectedTasks((ids) => event.target.checked ? [...ids, check.task_id!] : ids.filter((id) => id !== check.task_id))} />
            <span>{check.label}<span className="block text-xs text-slate-400">{check.done ? 'Complete' : check.can_complete ? 'Check to mark your task complete when saving' : check.kind === 'document' ? 'Upload / approve the latest document in the workspace' : check.kind === 'checklist' ? 'Create and complete this configured task in the workspace' : 'Must be resolved before handoff'}</span></span>
          </label>)}
          <Link className="inline-block text-xs text-indigo-300 underline" href={`/cases/${caseData.id}`} onClick={close}>Open case tasks and documents</Link>
        </fieldset>}
        <Select id="handoff-status" label="Next step" value={status} disabled={saving || loading || !!loadError}
          options={CASE_STATUS_OPTIONS.filter((option) => stages.some((stage) => stage.status_code === option.value))}
          onChange={(event) => {
            setStatus(event.target.value); setConfirmed(false);
            const suggested = stages.find((stage) => stage.status_code === event.target.value)?.default_assigned_employee_id;
            if (suggested && employees.some((employee) => employee.id === suggested)) setAssignedTo(suggested);
          }} />
        <Select id="handoff-assignee" label="Next responsible person" required value={assignedTo}
          onChange={(event) => setAssignedTo(event.target.value)} disabled={saving || loading || !!loadError}
          placeholder="Select an employee" options={employees.map((employee) => ({ value: employee.id, label: `${employee.full_name} (${employee.email})` }))} />
        <Textarea id="handoff-notes" label="Handoff note" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={saving} rows={2} placeholder="What is finished, and what should happen next?" />
        {moving && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={saving} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 accent-indigo-500" />I confirm my work for this step is complete.</label>}
        {needsOverride && <div className="rounded-lg border border-amber-500/30 p-3 text-sm text-amber-300">
          {unmet.length > 0 && <p>{unmet.length} requirement(s) remain incomplete.</p>}
          {skipping && <p>Skipping steps or moving back requires a manager override.</p>}
          {manager ? <Textarea id="override-reason" label="Manager override reason (at least 5 characters)" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} disabled={saving} placeholder="Explain why this case may proceed. This is recorded in history." /> : <p>Complete them first or ask an owner / manager to review.</p>}
        </div>}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
          <Button type="button" variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" isLoading={saving} disabled={!user || loading || !!loadError || blocked || !assignedTo || !target || (moving && !confirmed)}>{moving ? 'Complete & Handoff' : 'Save Assignment'}</Button>
        </div>
      </form>
    </Modal>
  );
}
