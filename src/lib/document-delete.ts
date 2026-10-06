import type { SupabaseClient } from '@supabase/supabase-js';

export async function removeDocumentFile(client: SupabaseClient, filePath: string) {
  const { data, error } = await client.storage.from('case-documents').remove([filePath]);
  if (error) throw new Error(error.message);
  // Storage can silently return no objects when an RLS policy denies deletion.
  if (!data?.length) throw new Error('File removal could not be confirmed. The file may already be missing, or storage permissions may need updating.');
}

export async function deleteCaseDocument(client: SupabaseClient, uploadId: string, caseId: string) {
  const { data, error } = await client.rpc('delete_case_document', { p_upload_id: uploadId, p_case_id: caseId });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new Error('Document deletion needs a database update. Run supabase-document-delete-v7.sql in Supabase first.');
    }
    throw new Error(error.message);
  }
  // Only use the path returned by the authorized database operation.
  const filePath = data?.file_path as string | undefined;
  if (!filePath) return { cleanupPath: null, warning: 'Document removed, but no stored file path was returned.' };
  try {
    await removeDocumentFile(client, filePath);
    return { cleanupPath: null, warning: null };
  } catch (err) {
    return { cleanupPath: filePath, warning: `Removed from checklist, but stored file cleanup needs attention: ${err instanceof Error ? err.message : 'Storage request failed'}` };
  }
}
