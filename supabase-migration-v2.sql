-- ============================================================
-- CRM Migration v2: Buildings, Documents, Comments, Notifications
-- Run this in Supabase SQL Editor AFTER the base schema
-- ============================================================

-- ============================================================
-- 1. BUILDINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT,
  address TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buildings_name ON buildings(name);
CREATE INDEX IF NOT EXISTS idx_buildings_is_active ON buildings(is_active);
CREATE INDEX IF NOT EXISTS idx_buildings_created_at ON buildings(created_at);

DROP TRIGGER IF EXISTS update_buildings_updated_at ON buildings;
CREATE TRIGGER update_buildings_updated_at
  BEFORE UPDATE ON buildings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. ADD building_id TO CASES
-- ============================================================
ALTER TABLE cases ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES buildings(id);
CREATE INDEX IF NOT EXISTS idx_cases_building_id ON cases(building_id);

-- ============================================================
-- 3. DOCUMENT REQUIREMENTS TABLE (configurable per stage)
-- ============================================================
CREATE TABLE IF NOT EXISTS document_requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage_id UUID NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_req_stage_id ON document_requirements(stage_id);

DROP TRIGGER IF EXISTS update_document_requirements_updated_at ON document_requirements;
CREATE TRIGGER update_document_requirements_updated_at
  BEFORE UPDATE ON document_requirements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. DOCUMENT UPLOADS TABLE (full versioned document system)
-- ============================================================
CREATE TABLE IF NOT EXISTS document_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  requirement_id UUID REFERENCES document_requirements(id),
  document_name TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  rejection_reason TEXT,
  version INT NOT NULL DEFAULT 1,
  uploaded_by UUID REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_uploads_case_id ON document_uploads(case_id);
CREATE INDEX IF NOT EXISTS idx_doc_uploads_requirement_id ON document_uploads(requirement_id);
CREATE INDEX IF NOT EXISTS idx_doc_uploads_status ON document_uploads(status);
CREATE INDEX IF NOT EXISTS idx_doc_uploads_uploaded_by ON document_uploads(uploaded_by);

DROP TRIGGER IF EXISTS update_document_uploads_updated_at ON document_uploads;
CREATE TRIGGER update_document_uploads_updated_at
  BEFORE UPDATE ON document_uploads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 5. CASE COMMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS case_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_comments_case_id ON case_comments(case_id);
CREATE INDEX IF NOT EXISTS idx_case_comments_user_id ON case_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_case_comments_created_at ON case_comments(created_at);

DROP TRIGGER IF EXISTS update_case_comments_updated_at ON case_comments;
CREATE TRIGGER update_case_comments_updated_at
  BEFORE UPDATE ON case_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 6. ADD additional columns to NOTIFICATIONS
-- ============================================================
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_case_id UUID REFERENCES cases(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_task_id UUID REFERENCES tasks(id);

-- ============================================================
-- 7. RLS POLICIES FOR NEW TABLES
-- ============================================================

-- Buildings RLS
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buildings viewable by authenticated users" ON buildings;
CREATE POLICY "Buildings viewable by authenticated users"
  ON buildings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Buildings manageable by owners and managers" ON buildings;
CREATE POLICY "Buildings manageable by owners and managers"
  ON buildings FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('owner', 'manager')
    )
  );

-- Document Requirements RLS
ALTER TABLE document_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Document requirements viewable by authenticated users" ON document_requirements;
CREATE POLICY "Document requirements viewable by authenticated users"
  ON document_requirements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Document requirements manageable by owners and managers" ON document_requirements;
CREATE POLICY "Document requirements manageable by owners and managers"
  ON document_requirements FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('owner', 'manager')
    )
  );

-- Document Uploads RLS
ALTER TABLE document_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Document uploads viewable by authenticated users" ON document_uploads;
CREATE POLICY "Document uploads viewable by authenticated users"
  ON document_uploads FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Document uploads insertable by authenticated users" ON document_uploads;
CREATE POLICY "Document uploads insertable by authenticated users"
  ON document_uploads FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Document uploads updatable by authenticated users" ON document_uploads;
CREATE POLICY "Document uploads updatable by authenticated users"
  ON document_uploads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Document uploads deletable by owners and managers" ON document_uploads;
CREATE POLICY "Document uploads deletable by owners and managers"
  ON document_uploads FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('owner', 'manager')
    )
  );

-- Case Comments RLS
ALTER TABLE case_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Case comments viewable by authenticated users" ON case_comments;
CREATE POLICY "Case comments viewable by authenticated users"
  ON case_comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Case comments insertable by authenticated users" ON case_comments;
CREATE POLICY "Case comments insertable by authenticated users"
  ON case_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Case comments updatable by author" ON case_comments;
CREATE POLICY "Case comments updatable by author"
  ON case_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Case comments deletable by author or owners" ON case_comments;
CREATE POLICY "Case comments deletable by author or owners"
  ON case_comments FOR DELETE TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('owner', 'manager')
    )
  );

-- ============================================================
-- 8. SUPABASE STORAGE: case-documents bucket setup
-- Run THESE statements in Supabase Dashboard > SQL Editor with service_role:
--
-- INSERT INTO storage.buckets (id, name, public) VALUES ('case-documents', 'case-documents', false) ON CONFLICT DO NOTHING;
-- DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
-- CREATE POLICY "Authenticated users can upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'case-documents');
-- DROP POLICY IF EXISTS "Authenticated users can view" ON storage.objects;
-- CREATE POLICY "Authenticated users can view" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'case-documents');
-- DROP POLICY IF EXISTS "Authenticated users can delete own" ON storage.objects;
-- CREATE POLICY "Authenticated users can delete own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'case-documents');
-- ============================================================

-- ============================================================
-- 9. HELPER FUNCTION: Create notification
-- ============================================================
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'info',
  p_link TEXT DEFAULT NULL,
  p_case_id UUID DEFAULT NULL,
  p_task_id UUID DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO notifications (user_id, title, message, type, link, related_case_id, related_task_id)
  VALUES (p_user_id, p_title, p_message, p_type, p_link, p_case_id, p_task_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. SEED: Default document requirements for known stages
-- ============================================================
DO $$
DECLARE
  doc_collection_stage_id UUID;
  doc_verification_stage_id UUID;
BEGIN
  SELECT id INTO doc_collection_stage_id FROM workflow_stages WHERE name = 'Document Collection' LIMIT 1;
  SELECT id INTO doc_verification_stage_id FROM workflow_stages WHERE name = 'Document Verification' LIMIT 1;

  IF doc_collection_stage_id IS NOT NULL THEN
    INSERT INTO document_requirements (stage_id, name, description, is_mandatory, display_order) VALUES
      (doc_collection_stage_id, 'PAN Card', 'Permanent Account Number card (front and back)', true, 1),
      (doc_collection_stage_id, 'Aadhaar Card', 'Aadhaar card (front and back)', true, 2),
      (doc_collection_stage_id, 'Bank Statement', 'Last 6 months bank statement', true, 3),
      (doc_collection_stage_id, 'Salary Slip', 'Last 3 months salary slips', true, 4),
      (doc_collection_stage_id, 'Address Proof', 'Utility bill, passport, or voter ID', true, 5),
      (doc_collection_stage_id, 'Property Documents', 'Sale deed, property tax receipts', false, 6)
    ON CONFLICT DO NOTHING;
  END IF;

  IF doc_verification_stage_id IS NOT NULL THEN
    INSERT INTO document_requirements (stage_id, name, description, is_mandatory, display_order) VALUES
      (doc_verification_stage_id, 'Verification Checklist', 'Completed document verification checklist', true, 1),
      (doc_verification_stage_id, 'Credit Report', 'CIBIL or credit bureau report', true, 2)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
