-- ============================================================
-- SUPABASE PERMISSIONS & RLS RECURSION FIX
-- ============================================================

-- 1. Grant table & schema privileges to Supabase roles
-- Fixes: "42501 permission denied for table customers / cases"
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- 2. Helper function with SECURITY DEFINER
-- Fixes: "42P17 infinite recursion detected in policy for relation profiles"
CREATE OR REPLACE FUNCTION public.is_owner_or_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid() AND r.name IN ('owner', 'manager')
  );
$$;

-- 3. Fix PROFILES policies (removes infinite recursion)
DROP POLICY IF EXISTS "Owners can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Owners can manage all profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.is_owner_or_manager())
  WITH CHECK (public.is_owner_or_manager());

-- 4. Fix WORKFLOW_STAGES policies
DROP POLICY IF EXISTS "Workflow stages are viewable by authenticated users" ON public.workflow_stages;
DROP POLICY IF EXISTS "Workflow stages are manageable by owners" ON public.workflow_stages;

CREATE POLICY "Workflow stages are viewable by authenticated users"
  ON public.workflow_stages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Workflow stages are manageable by owners"
  ON public.workflow_stages FOR ALL
  TO authenticated
  USING (public.is_owner_or_manager())
  WITH CHECK (public.is_owner_or_manager());

-- 5. Fix CUSTOMERS policies
DROP POLICY IF EXISTS "Customers are viewable by authenticated users" ON public.customers;
DROP POLICY IF EXISTS "Customers are insertable by authenticated users" ON public.customers;
DROP POLICY IF EXISTS "Customers are updatable by authenticated users" ON public.customers;
DROP POLICY IF EXISTS "Customers are deletable by owners/managers" ON public.customers;

CREATE POLICY "Customers are viewable by authenticated users"
  ON public.customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Customers are insertable by authenticated users"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Customers are updatable by authenticated users"
  ON public.customers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Customers are deletable by owners/managers"
  ON public.customers FOR DELETE
  TO authenticated
  USING (public.is_owner_or_manager());

-- 6. Fix CASES policies
DROP POLICY IF EXISTS "Cases are viewable by authenticated users" ON public.cases;
DROP POLICY IF EXISTS "Cases are insertable by authenticated users" ON public.cases;
DROP POLICY IF EXISTS "Cases are updatable by authenticated users" ON public.cases;
DROP POLICY IF EXISTS "Cases are deletable by owners/managers" ON public.cases;

CREATE POLICY "Cases are viewable by authenticated users"
  ON public.cases FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Cases are insertable by authenticated users"
  ON public.cases FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Cases are updatable by authenticated users"
  ON public.cases FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Cases are deletable by owners/managers"
  ON public.cases FOR DELETE
  TO authenticated
  USING (public.is_owner_or_manager());

-- 7. Fix TASKS policies
DROP POLICY IF EXISTS "Tasks are viewable by authenticated users" ON public.tasks;
DROP POLICY IF EXISTS "Tasks are insertable by authenticated users" ON public.tasks;
DROP POLICY IF EXISTS "Tasks are updatable by authenticated users" ON public.tasks;
DROP POLICY IF EXISTS "Tasks are deletable by owners/managers" ON public.tasks;

CREATE POLICY "Tasks are viewable by authenticated users"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Tasks are insertable by authenticated users"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Tasks are updatable by authenticated users"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Tasks are deletable by owners/managers"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (public.is_owner_or_manager());

-- 8. Fix DOCUMENTS & DOCUMENT_UPLOADS policies
DROP POLICY IF EXISTS "Documents are viewable by authenticated users" ON public.documents;
DROP POLICY IF EXISTS "Documents are insertable by authenticated users" ON public.documents;
DROP POLICY IF EXISTS "Documents are deletable by owners/managers" ON public.documents;

CREATE POLICY "Documents are viewable by authenticated users"
  ON public.documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Documents are insertable by authenticated users"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Documents are deletable by owners/managers"
  ON public.documents FOR DELETE
  TO authenticated
  USING (public.is_owner_or_manager());

DROP POLICY IF EXISTS "Document uploads viewable by authenticated users" ON public.document_uploads;
DROP POLICY IF EXISTS "Document uploads insertable by authenticated users" ON public.document_uploads;
DROP POLICY IF EXISTS "Document uploads updatable by authenticated users" ON public.document_uploads;
DROP POLICY IF EXISTS "Document uploads deletable by owners and managers" ON public.document_uploads;

CREATE POLICY "Document uploads viewable by authenticated users"
  ON public.document_uploads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Document uploads insertable by authenticated users"
  ON public.document_uploads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Document uploads updatable by authenticated users"
  ON public.document_uploads FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Document uploads deletable by owners and managers"
  ON public.document_uploads FOR DELETE
  TO authenticated
  USING (public.is_owner_or_manager());

-- 9. Fix BUILDINGS & DOCUMENT_REQUIREMENTS policies
DROP POLICY IF EXISTS "Buildings are viewable by authenticated users" ON public.buildings;
DROP POLICY IF EXISTS "Buildings are manageable by owners and managers" ON public.buildings;

CREATE POLICY "Buildings are viewable by authenticated users"
  ON public.buildings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Buildings are manageable by owners and managers"
  ON public.buildings FOR ALL
  TO authenticated
  USING (public.is_owner_or_manager())
  WITH CHECK (public.is_owner_or_manager());

DROP POLICY IF EXISTS "Document requirements viewable by authenticated users" ON public.document_requirements;
DROP POLICY IF EXISTS "Document requirements manageable by owners and managers" ON public.document_requirements;

CREATE POLICY "Document requirements viewable by authenticated users"
  ON public.document_requirements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Document requirements manageable by owners and managers"
  ON public.document_requirements FOR ALL
  TO authenticated
  USING (public.is_owner_or_manager())
  WITH CHECK (public.is_owner_or_manager());

-- 10. Fix CASE_COMMENTS policies
DROP POLICY IF EXISTS "Case comments viewable by authenticated users" ON public.case_comments;
DROP POLICY IF EXISTS "Case comments insertable by authenticated users" ON public.case_comments;
DROP POLICY IF EXISTS "Case comments updatable by author" ON public.case_comments;
DROP POLICY IF EXISTS "Case comments deletable by author or owners" ON public.case_comments;

CREATE POLICY "Case comments viewable by authenticated users"
  ON public.case_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Case comments insertable by authenticated users"
  ON public.case_comments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Case comments updatable by author"
  ON public.case_comments FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Case comments deletable by author or owners"
  ON public.case_comments FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_owner_or_manager());

-- 11. Fix ACTIVITIES & NOTIFICATIONS policies
DROP POLICY IF EXISTS "Activities are viewable by authenticated users" ON public.activities;
DROP POLICY IF EXISTS "Activities are insertable by authenticated users" ON public.activities;

CREATE POLICY "Activities are viewable by authenticated users"
  ON public.activities FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Activities are insertable by authenticated users"
  ON public.activities FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Notifications can be created by authenticated users" ON public.notifications;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Notifications can be created by authenticated users"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);
