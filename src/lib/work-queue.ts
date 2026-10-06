import { isActiveCase } from './case-status';
import type { Case, Task } from '@/types';

export type QueueTab = 'assigned' | 'new' | 'today' | 'overdue';
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function caseMatchesQueue(c: Case, tab: QueueTab, userId: string, today = localDateKey()) {
  if (!isActiveCase(c.status)) return false;
  const assigned = c.assigned_to === userId;
  const followUp = c.work_flag && c.work_flag !== 'none' && c.flag_owner_id === userId ? c.follow_up_date : null;
  const due = assigned && c.stage_due_date ? localDateKey(new Date(c.stage_due_date)) : null;
  if (tab === 'assigned') return assigned;
  if (tab === 'new') return assigned && !!c.handoff_at && !c.handoff_accepted_at;
  if (tab === 'today') return due === today || followUp === today;
  return (!!due && due < today) || (!!followUp && followUp < today);
}

export function taskMatchesQueue(task: Task, tab: QueueTab, today = localDateKey()) {
  if (task.status === 'completed' || task.status === 'cancelled') return false;
  if (tab === 'new') return false;
  if (tab === 'assigned') return true;
  const due = task.due_date?.slice(0, 10);
  return !!due && (tab === 'today' ? due === today : due < today);
}
