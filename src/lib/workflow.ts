import type { SupabaseClient } from '@supabase/supabase-js';

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
