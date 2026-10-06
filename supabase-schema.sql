-- ============================================
-- CRM Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ROLES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default roles
INSERT INTO roles (name, description) VALUES
  ('owner', 'Business owner with full access'),
  ('manager', 'Manager with elevated access'),
  ('employee', 'Standard employee access')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- PROFILES TABLE (extends Supabase auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role_id UUID NOT NULL REFERENCES roles(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

-- ============================================
-- CUSTOMERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  customer_type TEXT NOT NULL DEFAULT 'individual',
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_full_name ON customers(full_name);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_customer_type ON customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at);

-- ============================================
-- WORKFLOW STAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS workflow_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  responsible_role_id UUID REFERENCES roles(id),
  default_assigned_employee_id UUID REFERENCES profiles(id),
  sla_days INT NOT NULL DEFAULT 3,
  required_task_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_stages_display_order ON workflow_stages(display_order);

-- Migration alter statements for existing tables
ALTER TABLE workflow_stages ADD COLUMN IF NOT EXISTS responsible_role_id UUID REFERENCES roles(id);
ALTER TABLE workflow_stages ADD COLUMN IF NOT EXISTS default_assigned_employee_id UUID REFERENCES profiles(id);
ALTER TABLE workflow_stages ADD COLUMN IF NOT EXISTS sla_days INT NOT NULL DEFAULT 3;
ALTER TABLE workflow_stages ADD COLUMN IF NOT EXISTS required_task_title TEXT;

-- Seed default configurable workflow stages
INSERT INTO workflow_stages (name, description, display_order, color, sla_days, required_task_title) VALUES
  ('Lead Generation', 'Initial inquiry and lead capturing', 1, '#6366f1', 2, 'Initial Customer Contact'),
  ('Calculation', 'Financial & quote calculation', 2, '#8b5cf6', 2, 'Perform Calculations & Quotes'),
  ('Document Collection', 'Gathering required documentation', 3, '#f59e0b', 3, 'Collect Required Documents'),
  ('Document Verification', 'Reviewing and verifying submitted documents', 4, '#ec4899', 2, 'Verify Submitted Documents'),
  ('Bank Processing', 'Processing with banking partners', 5, '#06b6d4', 5, 'Submit to Partner Banks'),
  ('Approval', 'Final management or underwriter approval', 6, '#3b82f6', 2, 'Review for Final Approval'),
  ('Completion', 'Case successfully completed', 7, '#22c55e', 1, 'Final Handover & Case Closure')
ON CONFLICT DO NOTHING;

-- ============================================
-- CASES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  case_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'lead',
  priority TEXT NOT NULL DEFAULT 'medium',
  current_stage_id UUID REFERENCES workflow_stages(id),
  assigned_to UUID REFERENCES profiles(id),
  stage_entered_at TIMESTAMPTZ DEFAULT NOW(),
  stage_due_date TIMESTAMPTZ,
  description TEXT,
  notes TEXT,
  expected_completion_date DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cases ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE cases ADD COLUMN IF NOT EXISTS stage_due_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cases_customer_id ON cases(customer_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_priority ON cases(priority);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_cases_current_stage_id ON cases(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_cases_case_number ON cases(case_number);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at);

-- ============================================
-- CASE STAGE HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS case_stage_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES workflow_stages(id),
  to_stage_id UUID NOT NULL REFERENCES workflow_stages(id),
  changed_by UUID REFERENCES profiles(id),
  assigned_to UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_stage_history_case_id ON case_stage_history(case_id);
CREATE INDEX IF NOT EXISTS idx_case_stage_history_created_at ON case_stage_history(created_at);

-- ============================================
-- TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES workflow_stages(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to UUID REFERENCES profiles(id),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES workflow_stages(id);

CREATE INDEX IF NOT EXISTS idx_tasks_case_id ON tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

-- ============================================
-- DOCUMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_case_id ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_documents_customer_id ON documents(customer_id);

-- ============================================
-- ACTIVITIES TABLE (audit log)
-- ============================================
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_case_id ON activities(case_id);
CREATE INDEX IF NOT EXISTS idx_activities_customer_id ON activities(customer_id);
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- ============================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to relevant tables
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cases_updated_at ON cases;
CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_stages_updated_at ON workflow_stages;
CREATE TRIGGER update_workflow_stages_updated_at
  BEFORE UPDATE ON workflow_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- AUTO CASE NUMBER GENERATION
-- ============================================
CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(case_number FROM 5) AS INT)), 0) + 1
  INTO next_num
  FROM cases;
  NEW.case_number = 'CAS-' || LPAD(next_num::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_case_number ON cases;
CREATE TRIGGER set_case_number
  BEFORE INSERT ON cases
  FOR EACH ROW
  WHEN (NEW.case_number IS NULL OR NEW.case_number = '')
  EXECUTE FUNCTION generate_case_number();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_stage_history ENABLE ROW LEVEL SECURITY;

-- Case Stage History: readable and insertable by authenticated users
DROP POLICY IF EXISTS "Case stage history viewable by authenticated users" ON case_stage_history;
CREATE POLICY "Case stage history viewable by authenticated users"
  ON case_stage_history FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Case stage history insertable by authenticated users" ON case_stage_history;
CREATE POLICY "Case stage history insertable by authenticated users"
  ON case_stage_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Workflow stages: readable by authenticated users, manageable by owners & managers
DROP POLICY IF EXISTS "Workflow stages are viewable by authenticated users" ON workflow_stages;
CREATE POLICY "Workflow stages are viewable by authenticated users"
  ON workflow_stages FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Workflow stages are manageable by owners" ON workflow_stages;
CREATE POLICY "Workflow stages are manageable by owners"
  ON workflow_stages FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('owner', 'manager')
    )
  );

-- Profiles: users can read all profiles, update own
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Owners can manage all profiles" ON profiles;
CREATE POLICY "Owners can manage all profiles"
  ON profiles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('owner', 'manager')
    )
  );

-- Customers: authenticated users can CRUD
DROP POLICY IF EXISTS "Customers are viewable by authenticated users" ON customers;
CREATE POLICY "Customers are viewable by authenticated users"
  ON customers FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Customers are insertable by authenticated users" ON customers;
CREATE POLICY "Customers are insertable by authenticated users"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Customers are updatable by authenticated users" ON customers;
CREATE POLICY "Customers are updatable by authenticated users"
  ON customers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Customers are deletable by owners/managers" ON customers;
CREATE POLICY "Customers are deletable by owners/managers"
  ON customers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('owner', 'manager')
    )
  );

-- Cases: authenticated users can CRUD
DROP POLICY IF EXISTS "Cases are viewable by authenticated users" ON cases;
CREATE POLICY "Cases are viewable by authenticated users"
  ON cases FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Cases are insertable by authenticated users" ON cases;
CREATE POLICY "Cases are insertable by authenticated users"
  ON cases FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Cases are updatable by authenticated users" ON cases;
CREATE POLICY "Cases are updatable by authenticated users"
  ON cases FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Cases are deletable by owners/managers" ON cases;
CREATE POLICY "Cases are deletable by owners/managers"
  ON cases FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('owner', 'manager')
    )
  );

-- Tasks: authenticated users can CRUD
DROP POLICY IF EXISTS "Tasks are viewable by authenticated users" ON tasks;
CREATE POLICY "Tasks are viewable by authenticated users"
  ON tasks FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Tasks are insertable by authenticated users" ON tasks;
CREATE POLICY "Tasks are insertable by authenticated users"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Tasks are updatable by authenticated users" ON tasks;
CREATE POLICY "Tasks are updatable by authenticated users"
  ON tasks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Tasks are deletable by owners/managers" ON tasks;
CREATE POLICY "Tasks are deletable by owners/managers"
  ON tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('owner', 'manager')
    )
  );

-- Documents: authenticated users can CRUD
DROP POLICY IF EXISTS "Documents are viewable by authenticated users" ON documents;
CREATE POLICY "Documents are viewable by authenticated users"
  ON documents FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Documents are insertable by authenticated users" ON documents;
CREATE POLICY "Documents are insertable by authenticated users"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Documents are updatable by authenticated users" ON documents;
CREATE POLICY "Documents are updatable by authenticated users"
  ON documents FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Documents are deletable by owners/managers" ON documents;
CREATE POLICY "Documents are deletable by owners/managers"
  ON documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('owner', 'manager')
    )
  );

-- Activities: authenticated users can view and insert
DROP POLICY IF EXISTS "Activities are viewable by authenticated users" ON activities;
CREATE POLICY "Activities are viewable by authenticated users"
  ON activities FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Activities are insertable by authenticated users" ON activities;
CREATE POLICY "Activities are insertable by authenticated users"
  ON activities FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Notifications: users can view/update their own
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Notifications are insertable by authenticated users" ON notifications;
CREATE POLICY "Notifications are insertable by authenticated users"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- FUNCTION: Handle new user signup
-- Creates a profile when a user signs up
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_role_id UUID;
  user_count INT;
  assigned_role TEXT;
BEGIN
  -- Determine role: first user is owner, rest are employees
  SELECT COUNT(*) INTO user_count FROM public.profiles;
  IF user_count = 0 THEN
    assigned_role := 'owner';
  ELSE
    assigned_role := 'employee';
  END IF;

  -- Get role ID
  SELECT id INTO default_role_id FROM public.roles WHERE name = assigned_role LIMIT 1;

  -- Fallback to any existing role
  IF default_role_id IS NULL THEN
    SELECT id INTO default_role_id FROM public.roles LIMIT 1;
  END IF;

  -- If roles table is completely empty, insert default roles
  IF default_role_id IS NULL THEN
    INSERT INTO public.roles (name, description) VALUES
      ('owner', 'Business owner with full access'),
      ('manager', 'Manager with elevated access'),
      ('employee', 'Standard employee access')
    ON CONFLICT (name) DO NOTHING;

    SELECT id INTO default_role_id FROM public.roles WHERE name = assigned_role LIMIT 1;
  END IF;

  -- Insert profile, handling potential conflicts safely
  INSERT INTO public.profiles (id, full_name, email, role_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    default_role_id
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user trigger: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- CRM v2 ADDITIONS: Buildings, Document Management, Case Comments
-- ============================================

-- ============================================
-- BUILDINGS TABLE
-- ============================================
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

-- Add building_id to cases
ALTER TABLE cases ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES buildings(id);
CREATE INDEX IF NOT EXISTS idx_cases_building_id ON cases(building_id);

-- ============================================
-- DOCUMENT REQUIREMENTS TABLE (per workflow stage)
-- ============================================
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

-- ============================================
-- DOCUMENT UPLOADS TABLE (versioned)
-- ============================================
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

-- ============================================
-- CASE COMMENTS TABLE
-- ============================================
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

-- Add related entities to notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_case_id UUID REFERENCES cases(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_task_id UUID REFERENCES tasks(id);

-- ============================================
-- RLS POLICIES FOR v2 TABLES
-- ============================================
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_comments ENABLE ROW LEVEL SECURITY;

-- Buildings
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

-- Document Requirements
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

-- Document Uploads
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

-- Case Comments
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

