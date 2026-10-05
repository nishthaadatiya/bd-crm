import { SupabaseClient } from '@supabase/supabase-js';
import type { WorkflowStage, Case } from '@/types';

export interface TransitionOptions {
  caseId: string;
  targetStage: WorkflowStage;
  userId: string;
  assignedTo?: string | null;
  notes?: string;
  currentStageName?: string;
}

/**
 * Creates an in-app notification for a user.
 */
export async function sendNotification(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  link?: string,
  caseId?: string,
  taskId?: string
) {
  if (!userId) return;
  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      title,
      message,
      type,
      link: link || null,
      related_case_id: caseId || null,
      related_task_id: taskId || null,
    });
  } catch {
    // Non-fatal — notifications are best-effort
  }
}

export async function transitionCaseStage(
  supabase: SupabaseClient,
  options: TransitionOptions
) {
  const { caseId, targetStage, userId, assignedTo, notes, currentStageName } = options;

  // 1. Fetch current case details
  const { data: currentCase, error: caseErr } = await supabase
    .from('cases')
    .select('*, customer:customers(full_name)')
    .eq('id', caseId)
    .single();

  if (caseErr || !currentCase) {
    throw new Error('Case not found');
  }

  // 2. Determine assigned employee
  const finalAssignedTo =
    assignedTo !== undefined
      ? assignedTo
      : targetStage.default_assigned_employee_id || currentCase.assigned_to;

  // 3. Compute stage due date based on SLA days
  const slaDays = targetStage.sla_days || 3;
  const stageEnteredAt = new Date();
  const stageDueDate = new Date(stageEnteredAt.getTime() + slaDays * 24 * 60 * 60 * 1000);

  // 4. Determine status update (if completion stage, set completed)
  const isCompletionStage = targetStage.name.toLowerCase().includes('completion') || targetStage.name.toLowerCase().includes('close');
  const newStatus = isCompletionStage ? 'completed' : currentCase.status === 'new' ? 'in_progress' : currentCase.status;

  // 5. Update case
  const { error: updateErr } = await supabase
    .from('cases')
    .update({
      current_stage_id: targetStage.id,
      stage_entered_at: stageEnteredAt.toISOString(),
      stage_due_date: stageDueDate.toISOString(),
      assigned_to: finalAssignedTo,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseId);

  if (updateErr) throw updateErr;

  // 6. Record stage history
  await supabase.from('case_stage_history').insert({
    case_id: caseId,
    from_stage_id: currentCase.current_stage_id,
    to_stage_id: targetStage.id,
    changed_by: userId,
    assigned_to: finalAssignedTo,
    notes: notes || null,
  });

  // 7. Record activity entry
  const fromName = currentStageName || 'Previous Stage';
  const customerName = (currentCase.customer as { full_name?: string } | null)?.full_name || 'Customer';
  const activityDescription = `Case ${currentCase.case_number} (${customerName}) moved from "${fromName}" to "${targetStage.name}"`;

  await supabase.from('activities').insert({
    case_id: caseId,
    customer_id: currentCase.customer_id,
    user_id: userId,
    action: 'stage_transition',
    description: activityDescription,
    metadata: {
      from_stage_id: currentCase.current_stage_id,
      to_stage_id: targetStage.id,
      notes,
    },
  });

  // 8. Auto-create configured task(s) for the new stage
  const taskTitles = targetStage.required_task_title
    ? targetStage.required_task_title
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean)
    : [`Complete ${targetStage.name} stage for ${currentCase.case_number}`];

  const createdTasks: { id: string; title: string }[] = [];
  for (const title of taskTitles) {
    const { data: taskData } = await supabase
      .from('tasks')
      .insert({
        case_id: caseId,
        stage_id: targetStage.id,
        title,
        description: `Automated stage task for ${targetStage.name} (SLA: ${slaDays} days)`,
        status: 'pending',
        priority: currentCase.priority || 'medium',
        assigned_to: finalAssignedTo,
        due_date: stageDueDate.toISOString().split('T')[0],
        created_by: userId,
      })
      .select('id, title')
      .single();

    if (taskData) createdTasks.push(taskData);
  }

  // 9. Notify the assigned employee (if different from actor)
  if (finalAssignedTo && finalAssignedTo !== userId) {
    const caseLink = `/cases/${caseId}`;
    const taskSummary =
      createdTasks.length === 1
        ? `Task: "${createdTasks[0].title}"`
        : `${createdTasks.length} tasks generated for ${targetStage.name}`;

    await sendNotification(
      supabase,
      finalAssignedTo,
      `Case ${currentCase.case_number} moved to ${targetStage.name}`,
      `You have been assigned to case ${currentCase.case_number}. ${taskSummary}`,
      'info',
      caseLink,
      caseId,
      createdTasks[0]?.id
    );
  }

  return { success: true, stageDueDate };
}

/**
 * Reassigns a case to a new employee and notifies them.
 */
export async function reassignCase(
  supabase: SupabaseClient,
  caseId: string,
  newAssignedTo: string,
  actorId: string,
  notes?: string
) {
  const { data: currentCase, error } = await supabase
    .from('cases')
    .select('*, customer:customers(full_name)')
    .eq('id', caseId)
    .single();

  if (error || !currentCase) throw new Error('Case not found');

  const previousAssignedTo = currentCase.assigned_to;

  // Update case assignment
  const { error: updateErr } = await supabase
    .from('cases')
    .update({ assigned_to: newAssignedTo, updated_at: new Date().toISOString() })
    .eq('id', caseId);

  if (updateErr) throw updateErr;

  // Update open tasks for this case
  await supabase
    .from('tasks')
    .update({ assigned_to: newAssignedTo, updated_at: new Date().toISOString() })
    .eq('case_id', caseId)
    .in('status', ['pending', 'in_progress']);

  // Log activity
  const customerName = (currentCase.customer as { full_name?: string } | null)?.full_name || 'Customer';
  await supabase.from('activities').insert({
    case_id: caseId,
    customer_id: currentCase.customer_id,
    user_id: actorId,
    action: 'case_reassigned',
    description: `Case ${currentCase.case_number} (${customerName}) reassigned to new employee`,
    metadata: {
      from_assigned_to: previousAssignedTo,
      to_assigned_to: newAssignedTo,
      notes,
    },
  });

  // Notify new assignee
  if (newAssignedTo !== actorId) {
    await sendNotification(
      supabase,
      newAssignedTo,
      `Case ${currentCase.case_number} assigned to you`,
      notes || `You have been assigned case ${currentCase.case_number} (${customerName})`,
      'info',
      `/cases/${caseId}`,
      caseId
    );
  }

  return { success: true };
}
