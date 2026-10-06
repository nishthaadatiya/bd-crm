import type { SupabaseClient } from '@supabase/supabase-js';
import type { Case, Profile, Task, DocumentUpload, DocumentRequirement, Activity } from '@/types';

type ExportProfile = Pick<Profile, 'id' | 'full_name' | 'email' | 'phone'>;
export type ExportCase = Case & Record<string, unknown> & { flag_owner?: ExportProfile; creator?: ExportProfile };
export interface CaseReportData {
  caseData: ExportCase;
  tasks: Task[];
  documents: DocumentUpload[];
  requirements: DocumentRequirement[];
  activities: Activity[];
}

const CASE_SELECT = `*, customer:customers(*), building:buildings(*),
  assigned_profile:profiles!cases_assigned_to_fkey(id,full_name,email,phone),
  current_stage:workflow_stages(*)`;

export async function allPages<T>(fetchPage: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await fetchPage(start, start + 499);
    if (error) throw new Error(error.message);
    if (!data) throw new Error('The export could not read all records. Please retry.');
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

export async function loadAllCases(client: SupabaseClient) {
  const cases = await allPages<ExportCase>((start, end) => client.from('cases').select(CASE_SELECT).order('id').range(start, end));
  // Resolve human-readable names while retaining every raw case column and ID.
  const profiles = await allPages<ExportProfile>((start, end) => client.from('profiles').select('id,full_name,email,phone').order('id').range(start, end));
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return cases.map((c) => ({ ...c, creator: byId.get(c.created_by || ''), flag_owner: byId.get(c.flag_owner_id || '') }));
}

export async function loadCaseReport(client: SupabaseClient, id: string, internal: boolean): Promise<CaseReportData> {
  const { data, error } = await client.from('cases').select(CASE_SELECT).eq('id', id).single();
  if (error || !data) throw new Error(error?.message || 'Case not found');
  const [tasks, documents, requirements, activities] = await Promise.all([
    allPages<Task>((start, end) => client.from('tasks').select('*, assigned_profile:profiles!tasks_assigned_to_fkey(full_name)').eq('case_id', id).order('created_at').order('id').range(start, end)),
    allPages<DocumentUpload>((start, end) => client.from('document_uploads').select('*').eq('case_id', id).order('version', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(start, end)),
    allPages<DocumentRequirement>((start, end) => client.from('document_requirements').select('*').eq('is_active', true).order('display_order').order('id').range(start, end)),
    internal ? allPages<Activity>((start, end) => client.from('activities').select('*, user:profiles(full_name)').eq('case_id', id).order('created_at', { ascending: false }).order('id').range(start, end)) : Promise.resolve([]),
  ]);
  return { caseData: data as ExportCase, tasks, documents, requirements, activities };
}

export function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 100) || 'case';
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
