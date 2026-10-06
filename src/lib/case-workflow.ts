import type { SupabaseClient } from '@supabase/supabase-js';
import type { Case } from '@/types';

export interface CompletionCheck {
  key: string;
  label: string;
  kind: 'task' | 'document' | 'checklist' | 'flag';
  task_id?: string;
  done: boolean;
  can_complete: boolean;
}

export function workflowError(error: { message: string; code?: string }) {
  if (['PGRST202', '42703', '42883'].includes(error.code || '')) {
    return new Error('Workflow setup is not installed yet. Ask your administrator to apply supabase-workflow-v6.sql.');
  }
  return new Error(error.message);
}

export async function loadCompletionChecks(client: SupabaseClient, caseId: string) {
  const { data, error } = await client.rpc('case_completion_checks', { p_case_id: caseId });
  if (error) throw workflowError(error);
  return (data || []) as CompletionCheck[];
}

export function remainingChecks(checks: CompletionCheck[], selectedIds: string[]) {
  return checks.filter((check) => !check.done && !(check.can_complete && check.task_id && selectedIds.includes(check.task_id)));
}

export async function completeHandoff(client: SupabaseClient, c: Case, values: {
  status: string; assignedTo: string; notes: string; completeTaskIds: string[];
  confirmed: boolean; overrideReason: string;
}) {
  const { error } = await client.rpc('complete_case_handoff', {
    p_case_id: c.id, p_expected_updated_at: c.updated_at, p_status: values.status,
    p_assigned_to: values.assignedTo, p_notes: values.notes,
    p_complete_task_ids: values.completeTaskIds, p_confirm_completed: values.confirmed,
    p_override_reason: values.overrideReason,
  });
  if (error) throw workflowError(error);
}
