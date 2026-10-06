-- Run in Supabase SQL Editor to enable deletion of accidental document uploads.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_case_document(p_upload_id UUID,p_case_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE upload public.document_uploads; actor UUID:=auth.uid(); manager BOOLEAN;
BEGIN
  SELECT r.name IN ('owner','manager') INTO manager FROM public.profiles p JOIN public.roles r ON r.id=p.role_id
    WHERE p.id=actor AND p.is_active;
  IF manager IS NULL THEN RAISE EXCEPTION 'An active employee account is required'; END IF;
  -- Use the same case lock as handoffs so checklist deletion and handoff are serialized.
  PERFORM id FROM public.cases WHERE id=p_case_id FOR UPDATE;
  SELECT * INTO upload FROM public.document_uploads WHERE id=p_upload_id AND case_id=p_case_id FOR UPDATE;
  IF upload.id IS NULL THEN RAISE EXCEPTION 'Document no longer exists. Refresh the checklist.'; END IF;
  IF NOT manager AND upload.uploaded_by IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'You can only delete your own uploads. Ask an owner or manager for help.';
  END IF;
  -- Preserve the deletion audit even though the upload is removed from the checklist.
  INSERT INTO public.activities(case_id,user_id,action,description,metadata)
    VALUES(upload.case_id,actor,'document_deleted',
      'Deleted "'||upload.document_name||'" (v'||upload.version||'): '||upload.original_filename,
      jsonb_build_object('upload_id',upload.id,'requirement_id',upload.requirement_id,
        'filename',upload.original_filename,'version',upload.version,'previous_status',upload.status));
  DELETE FROM public.document_uploads WHERE id=upload.id;
  RETURN jsonb_build_object('file_path',upload.file_path);
END $$;

REVOKE ALL ON FUNCTION public.delete_case_document(UUID,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_case_document(UUID,UUID) TO authenticated;

-- Storage API removal needs both SELECT and DELETE permission. Limit this to the
-- case-documents bucket and the uploader's objects, or an active owner/manager.
DROP POLICY IF EXISTS "Case document deletion read access" ON storage.objects;
CREATE POLICY "Case document deletion read access" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='case-documents' AND EXISTS(
    SELECT 1 FROM public.profiles p JOIN public.roles r ON r.id=p.role_id
    WHERE p.id=auth.uid() AND p.is_active AND (owner_id=auth.uid()::text OR r.name IN ('owner','manager'))
  ));
DROP POLICY IF EXISTS "Case document deletion access" ON storage.objects;
CREATE POLICY "Case document deletion access" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='case-documents' AND EXISTS(
    SELECT 1 FROM public.profiles p JOIN public.roles r ON r.id=p.role_id
    WHERE p.id=auth.uid() AND p.is_active AND (owner_id=auth.uid()::text OR r.name IN ('owner','manager'))
  ));

NOTIFY pgrst,'reload schema';
COMMIT;
