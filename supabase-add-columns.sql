-- ============================================================
-- ADD MISSING COLUMNS & RELOAD SCHEMA CACHE
-- ============================================================

-- 1. Cases table columns
ALTER TABLE cases ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE cases ADD COLUMN IF NOT EXISTS stage_due_date TIMESTAMPTZ;

-- 2. Tasks table columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES workflow_stages(id);

-- 3. Workflow stages table columns
ALTER TABLE workflow_stages ADD COLUMN IF NOT EXISTS responsible_role_id UUID REFERENCES roles(id);
ALTER TABLE workflow_stages ADD COLUMN IF NOT EXISTS default_assigned_employee_id UUID REFERENCES profiles(id);
ALTER TABLE workflow_stages ADD COLUMN IF NOT EXISTS sla_days INT NOT NULL DEFAULT 3;
ALTER TABLE workflow_stages ADD COLUMN IF NOT EXISTS required_task_title TEXT;

-- 4. Notifications table columns
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_case_id UUID REFERENCES cases(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_task_id UUID REFERENCES tasks(id);

-- 5. Reload PostgREST schema cache so changes take effect immediately
NOTIFY pgrst, 'reload schema';
