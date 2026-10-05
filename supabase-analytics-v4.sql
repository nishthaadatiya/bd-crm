-- ============================================================
-- CRM Phase 3: Analytics Indexes & Secure Business Aggregations
-- Run this in Supabase SQL Editor to enable Executive Analytics
-- ============================================================

-- 1. Targeted performance indexes for fast dashboard aggregation
CREATE INDEX IF NOT EXISTS idx_cases_stage_due_date ON cases(stage_due_date);
CREATE INDEX IF NOT EXISTS idx_cases_building_status ON cases(building_id, status);
CREATE INDEX IF NOT EXISTS idx_cases_created_status ON cases(created_at, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date_status ON tasks(due_date, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON tasks(assigned_to, status);

-- 2. Secure Master Analytics RPC
-- Gathers KPIs, Pipeline throughput, Project Performance, and Financials in ONE call
CREATE OR REPLACE FUNCTION public.get_business_dashboard_metrics(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_building_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kpis JSONB;
  v_stage_pipeline JSONB;
  v_project_performance JSONB;
  v_loan_by_type JSONB;
  v_employee_workload JSONB;
BEGIN
  -- Strict Database-Level Authorization Check: Only Owner or Manager can call this function
  IF NOT public.is_owner_or_manager() THEN
    RAISE EXCEPTION 'Access denied: Business analytics are restricted to Owner and Manager roles.'
      USING ERRCODE = '42501';
  END IF;

  -- A. 9 Core Executive KPIs
  SELECT jsonb_build_object(
    'total_cases', COUNT(*),
    'new_cases', COUNT(*) FILTER (WHERE status = 'new'),
    'active_cases', COUNT(*) FILTER (WHERE status IN ('new', 'in_progress', 'waiting')),
    'completed_cases', COUNT(*) FILTER (WHERE status = 'completed'),
    'blocked_cases', COUNT(*) FILTER (WHERE status = 'blocked'),
    'overdue_cases', COUNT(*) FILTER (WHERE stage_due_date < NOW() AND status NOT IN ('completed', 'cancelled')),
    'total_loan_amount', COALESCE(SUM(loan_amount), 0),
    'active_loan_amount', COALESCE(SUM(loan_amount) FILTER (WHERE status NOT IN ('completed', 'cancelled')), 0),
    'completed_loan_amount', COALESCE(SUM(loan_amount) FILTER (WHERE status = 'completed'), 0)
  )
  INTO v_kpis
  FROM cases
  WHERE (p_building_id IS NULL OR building_id = p_building_id)
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);

  -- B. Dynamic Workflow Stage Pipeline (Cases, Loan Volume, Overdue, Avg Duration, SLA breaches)
  SELECT jsonb_agg(stage_row)
  INTO v_stage_pipeline
  FROM (
    SELECT 
      ws.id AS stage_id,
      ws.name AS stage_name,
      ws.color AS stage_color,
      ws.display_order,
      ws.sla_days,
      COUNT(c.id) AS case_count,
      COALESCE(SUM(c.loan_amount), 0) AS total_loan_amount,
      COUNT(c.id) FILTER (WHERE c.stage_due_date < NOW() AND c.status NOT IN ('completed', 'cancelled')) AS overdue_count,
      ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at))/86400), 0)::numeric, 1) AS avg_duration_days
    FROM workflow_stages ws
    LEFT JOIN cases c ON c.current_stage_id = ws.id
      AND (p_building_id IS NULL OR c.building_id = p_building_id)
      AND (p_start_date IS NULL OR c.created_at >= p_start_date)
      AND (p_end_date IS NULL OR c.created_at <= p_end_date)
      AND c.status NOT IN ('completed', 'cancelled')
    WHERE ws.is_active = true
    GROUP BY ws.id, ws.name, ws.color, ws.display_order, ws.sla_days
    ORDER BY ws.display_order ASC
  ) stage_row;

  -- C. Dynamic Project Performance (100% database-driven)
  SELECT jsonb_agg(proj_row)
  INTO v_project_performance
  FROM (
    SELECT
      b.id AS building_id,
      b.name AS building_name,
      b.code AS building_code,
      COUNT(c.id) AS total_cases,
      COUNT(c.id) FILTER (WHERE c.status IN ('new', 'in_progress', 'waiting')) AS active_cases,
      COUNT(c.id) FILTER (WHERE c.status = 'completed') AS completed_cases,
      COUNT(c.id) FILTER (WHERE c.status = 'blocked') AS blocked_cases,
      COUNT(c.id) FILTER (WHERE c.stage_due_date < NOW() AND c.status NOT IN ('completed', 'cancelled')) AS overdue_cases,
      COALESCE(SUM(c.loan_amount), 0) AS total_loan_value,
      ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (c.updated_at - c.created_at))/86400) FILTER (WHERE c.status = 'completed'), 0)::numeric, 1) AS avg_completion_days
    FROM buildings b
    LEFT JOIN cases c ON c.building_id = b.id
      AND (p_start_date IS NULL OR c.created_at >= p_start_date)
      AND (p_end_date IS NULL OR c.created_at <= p_end_date)
    WHERE (p_building_id IS NULL OR b.id = p_building_id)
      AND b.is_active = true
    GROUP BY b.id, b.name, b.code
    ORDER BY total_loan_value DESC
  ) proj_row;

  -- D. Loan Value by Case / Product Type
  SELECT jsonb_agg(type_row)
  INTO v_loan_by_type
  FROM (
    SELECT
      COALESCE(loan_type, case_type, 'General') AS product_type,
      COUNT(*) AS case_count,
      COALESCE(SUM(loan_amount), 0) AS total_loan_amount
    FROM cases
    WHERE (p_building_id IS NULL OR building_id = p_building_id)
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date)
    GROUP BY product_type
    ORDER BY total_loan_amount DESC
  ) type_row;

  -- E. Employee Workload Distribution
  SELECT jsonb_agg(emp_row)
  INTO v_employee_workload
  FROM (
    SELECT
      p.id AS employee_id,
      p.full_name AS employee_name,
      p.email AS employee_email,
      r.name AS role_name,
      COUNT(c.id) FILTER (WHERE c.status IN ('new', 'in_progress', 'waiting')) AS active_cases,
      COUNT(c.id) AS total_assigned_cases,
      COUNT(c.id) FILTER (WHERE c.status = 'completed') AS completed_cases,
      (
        SELECT COUNT(*) FROM tasks t 
        WHERE t.assigned_to = p.id AND t.status IN ('pending', 'in_progress')
      ) AS open_tasks,
      (
        SELECT COUNT(*) FROM tasks t 
        WHERE t.assigned_to = p.id AND t.status IN ('pending', 'in_progress') AND t.due_date < CURRENT_DATE
      ) AS overdue_tasks,
      ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (c.updated_at - c.created_at))/86400) FILTER (WHERE c.status = 'completed'), 0)::numeric, 1) AS avg_turnaround_days
    FROM profiles p
    JOIN roles r ON p.role_id = r.id
    LEFT JOIN cases c ON c.assigned_to = p.id
      AND (p_building_id IS NULL OR c.building_id = p_building_id)
      AND (p_start_date IS NULL OR c.created_at >= p_start_date)
      AND (p_end_date IS NULL OR c.created_at <= p_end_date)
    WHERE p.is_active = true
    GROUP BY p.id, p.full_name, p.email, r.name
    ORDER BY active_cases DESC
  ) emp_row;

  -- Return Combined JSON Object
  RETURN jsonb_build_object(
    'kpis', v_kpis,
    'pipeline', COALESCE(v_stage_pipeline, '[]'::jsonb),
    'projects', COALESCE(v_project_performance, '[]'::jsonb),
    'loan_by_type', COALESCE(v_loan_by_type, '[]'::jsonb),
    'employees', COALESCE(v_employee_workload, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_business_dashboard_metrics TO authenticated;
NOTIFY pgrst, 'reload schema';
