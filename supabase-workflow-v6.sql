-- Run after v5 in Supabase SQL Editor. All changes are transactional and rerunnable.
BEGIN;
ALTER TABLE public.workflow_stages ADD COLUMN IF NOT EXISTS status_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS workflow_stages_status_code ON public.workflow_stages(status_code);
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS work_flag TEXT NOT NULL DEFAULT 'none'
  CHECK (work_flag IN ('none', 'waiting', 'blocked'));
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS flag_reason TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS flag_owner_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS handoff_at TIMESTAMPTZ;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS handoff_accepted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS cases_work_queue ON public.cases(assigned_to, handoff_accepted_at, stage_due_date);
CREATE INDEX IF NOT EXISTS cases_follow_up ON public.cases(flag_owner_id, follow_up_date);

-- Reuse matching stages to retain their document requirements and settings.
DO $$
DECLARE item RECORD; stage UUID;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('lead','Lead',0), ('doc_collection','Doc collection',1),
    ('doc_verification','Doc verification',2), ('property_ips_processing','Property / IPS processing',3),
    ('search','Search',4), ('valuation','Valuation',5), ('login','Login',6),
    ('sanction','Sanction',7), ('mortgage','Mortgage',8), ('disbursement','Disbursement',9),
    ('payout','Payout',10), ('closed','Closed',11)
  ) AS steps(code,label,position) LOOP
    SELECT id INTO stage FROM public.workflow_stages
      WHERE status_code = item.code OR (status_code IS NULL AND
        lower(replace(name, 'Document', 'Doc')) = lower(item.label))
      ORDER BY (status_code IS NOT NULL) DESC, created_at LIMIT 1;
    IF stage IS NULL THEN
      INSERT INTO public.workflow_stages(name,status_code,display_order,sla_days,required_task_title)
        VALUES(item.label,item.code,item.position,3,
          CASE WHEN item.code = 'doc_verification' THEN 'Complete document verification checklist' ELSE NULL END);
    ELSE
      UPDATE public.workflow_stages SET status_code=item.code, display_order=item.position,
        required_task_title=CASE WHEN item.code='doc_verification' AND nullif(trim(required_task_title),'') IS NULL
          THEN 'Complete document verification checklist' ELSE required_task_title END
        WHERE id=stage;
    END IF;
  END LOOP;
END $$;

-- Read-only completion preview. The write function calls this again after marking chosen tasks complete.
CREATE OR REPLACE FUNCTION public.case_completion_checks(p_case_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE c public.cases; result JSONB; docs JSONB; configured JSONB; s public.workflow_stages;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to view completion checks'; END IF;
  SELECT * INTO STRICT c FROM public.cases WHERE id=p_case_id;
  SELECT * INTO s FROM public.workflow_stages WHERE id=c.current_stage_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'key',t.id,'label',t.title,'kind','task','task_id',t.id,
    'done',t.status='completed','can_complete',t.assigned_to=auth.uid()
  ) ORDER BY t.created_at),'[]'::jsonb) INTO result FROM public.tasks t
    WHERE t.case_id=c.id AND (t.stage_id=c.current_stage_id OR t.stage_id IS NULL) AND t.status<>'cancelled';

  -- Configured checklist titles must exist and be completed, even for older cases without generated tasks.
  SELECT coalesce(jsonb_agg(jsonb_build_object('key','configured:'||title,'label',title,
    'kind','checklist','done',false,'can_complete',false)),'[]'::jsonb) INTO configured
    FROM (SELECT trim(x) title FROM regexp_split_to_table(coalesce(s.required_task_title,''), E'\n') x) titles
    WHERE title<>'' AND NOT EXISTS(SELECT 1 FROM public.tasks t WHERE t.case_id=c.id
      AND t.stage_id=c.current_stage_id AND t.title=titles.title AND t.status<>'cancelled');
  result := result || configured;

  SELECT coalesce(jsonb_agg(jsonb_build_object('key',r.id,'label',r.name,
    'kind','document','done',coalesce(CASE WHEN c.status='doc_collection'
      THEN u.status IN ('uploaded','under_review','approved') ELSE u.status='approved' END,false),
    'can_complete',false)),'[]'::jsonb) INTO docs
    FROM public.document_requirements r JOIN public.workflow_stages ws ON ws.id=r.stage_id
    LEFT JOIN LATERAL (SELECT du.status FROM public.document_uploads du
      WHERE du.case_id=c.id AND du.requirement_id=r.id
      ORDER BY du.version DESC,du.created_at DESC,du.id DESC LIMIT 1) u ON true
    WHERE r.is_active AND r.is_mandatory AND (r.stage_id=c.current_stage_id
      OR (c.status='doc_verification' AND ws.status_code='doc_collection'));
  result := result || docs;
  IF c.work_flag<>'none' THEN
    result := result || jsonb_build_array(jsonb_build_object('key','hold','label','Resolve '||c.work_flag||': '||c.flag_reason,
      'kind','flag','done',false,'can_complete',false));
  END IF;
  RETURN result;
END $$;

-- Guard every write path (including old clients) against bypassing the checked handoff.
CREATE OR REPLACE FUNCTION public.guard_case_workflow()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE target UUID;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT id INTO target FROM public.workflow_stages WHERE status_code=NEW.status AND is_active;
    IF target IS NOT NULL THEN NEW.current_stage_id := target; END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.status,NEW.current_stage_id,NEW.assigned_to,NEW.work_flag,NEW.flag_reason,NEW.flag_owner_id,
      NEW.follow_up_date,NEW.handoff_at,NEW.handoff_accepted_at)
    IS DISTINCT FROM ROW(OLD.status,OLD.current_stage_id,OLD.assigned_to,OLD.work_flag,OLD.flag_reason,OLD.flag_owner_id,
      OLD.follow_up_date,OLD.handoff_at,OLD.handoff_accepted_at)
    AND auth.uid() IS NOT NULL
    AND current_setting('app.case_workflow_write',true) IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'Use Complete & Handoff or the case flag controls to update the workflow';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_case_workflow ON public.cases;
CREATE TRIGGER guard_case_workflow BEFORE INSERT OR UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.guard_case_workflow();

CREATE OR REPLACE FUNCTION public.complete_case_handoff(
  p_case_id UUID,p_expected_updated_at TIMESTAMPTZ,p_status TEXT,p_assigned_to UUID,
  p_notes TEXT DEFAULT '',p_complete_task_ids UUID[] DEFAULT '{}',
  p_confirm_completed BOOLEAN DEFAULT false,p_override_reason TEXT DEFAULT ''
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.cases; target public.workflow_stages; actor UUID:=auth.uid(); manager BOOLEAN;
  checks JSONB; unmet JSONB; moving BOOLEAN; task_title TEXT; due TIMESTAMPTZ;
  step_codes TEXT[]:=ARRAY['lead','doc_collection','doc_verification','property_ips_processing','search','valuation','login','sanction','mortgage','disbursement','payout','closed'];
  current_position INT; target_position INT; skipping BOOLEAN;
BEGIN
  SELECT r.name IN ('owner','manager') INTO manager FROM public.profiles p JOIN public.roles r ON r.id=p.role_id
    WHERE p.id=actor AND p.is_active;
  IF manager IS NULL THEN RAISE EXCEPTION 'An active employee account is required'; END IF;
  SELECT * INTO STRICT c FROM public.cases WHERE id=p_case_id FOR UPDATE;
  IF c.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'This case changed. Refresh before handing off.'; END IF;
  SELECT * INTO target FROM public.workflow_stages WHERE status_code=p_status AND is_active;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Select an active workflow step'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_assigned_to AND is_active) THEN
    RAISE EXCEPTION 'Select an active responsible person'; END IF;
  moving := p_status IS DISTINCT FROM c.status OR target.id IS DISTINCT FROM c.current_stage_id;
  current_position := array_position(step_codes,CASE c.status WHEN 'new' THEN 'lead' WHEN 'completed' THEN 'closed' ELSE c.status END);
  IF current_position IS NULL THEN
    SELECT array_position(step_codes,status_code) INTO current_position FROM public.workflow_stages WHERE id=c.current_stage_id;
  END IF;
  current_position := coalesce(current_position,0);
  target_position := array_position(step_codes,p_status);
  skipping := target_position NOT IN (current_position,current_position+1);
  IF moving AND skipping AND (NOT manager OR length(trim(coalesce(p_override_reason,'')))<5) THEN
    RAISE EXCEPTION 'Choose the next step. Only a manager can skip or move back with an override reason.';
  END IF;
  IF moving AND p_confirm_completed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm your step is complete'; END IF;
  IF cardinality(p_complete_task_ids)>0 AND EXISTS(
    SELECT 1 FROM unnest(p_complete_task_ids) chosen(id) WHERE NOT EXISTS(
      SELECT 1 FROM public.tasks t WHERE t.id=chosen.id AND t.case_id=c.id
        AND (t.stage_id=c.current_stage_id OR t.stage_id IS NULL) AND t.assigned_to=actor
        AND t.status IN ('pending','in_progress','completed'))
  ) THEN RAISE EXCEPTION 'Only your own current-step tasks can be completed here'; END IF;
  UPDATE public.tasks SET status='completed',completed_at=now(),updated_at=now()
    WHERE id=ANY(p_complete_task_ids) AND status<>'completed';
  checks := public.case_completion_checks(c.id);
  SELECT coalesce(jsonb_agg(value),'[]'::jsonb) INTO unmet FROM jsonb_array_elements(checks) WHERE NOT (value->>'done')::boolean;
  IF moving AND jsonb_array_length(unmet)>0 AND (NOT manager OR length(trim(coalesce(p_override_reason,'')))<5) THEN
    RAISE EXCEPTION 'Complete the required tasks and documents first. A manager may override with a reason.'; END IF;
  due := CASE WHEN p_status='closed' THEN NULL ELSE now()+make_interval(days=>greatest(target.sla_days,0)) END;
  PERFORM set_config('app.case_workflow_write',c.id::text,true);
  UPDATE public.cases SET status=p_status,current_stage_id=target.id,assigned_to=p_assigned_to,
    stage_entered_at=CASE WHEN moving THEN now() ELSE stage_entered_at END,
    stage_due_date=CASE WHEN moving THEN due ELSE stage_due_date END,
    work_flag=CASE WHEN moving THEN 'none' ELSE work_flag END,
    flag_reason=CASE WHEN moving THEN NULL ELSE flag_reason END,
    flag_owner_id=CASE WHEN moving THEN NULL ELSE flag_owner_id END,
    follow_up_date=CASE WHEN moving THEN NULL ELSE follow_up_date END,
    handoff_at=CASE WHEN moving OR assigned_to IS DISTINCT FROM p_assigned_to THEN now() ELSE handoff_at END,
    handoff_accepted_at=CASE WHEN moving OR assigned_to IS DISTINCT FROM p_assigned_to
      THEN CASE WHEN p_assigned_to=actor THEN now() ELSE NULL END ELSE handoff_accepted_at END,
    updated_at=now() WHERE id=c.id;
  IF moving THEN
    INSERT INTO public.case_stage_history(case_id,from_stage_id,to_stage_id,changed_by,assigned_to,notes)
      VALUES(c.id,c.current_stage_id,target.id,actor,p_assigned_to,nullif(trim(p_notes),''));
    IF p_status<>'closed' THEN
      FOR task_title IN SELECT trim(x) FROM regexp_split_to_table(
        coalesce(nullif(trim(target.required_task_title),''),'Complete '||target.name),E'\n') x LOOP
        IF task_title<>'' AND NOT EXISTS(SELECT 1 FROM public.tasks WHERE case_id=c.id AND stage_id=target.id
          AND tasks.title=task_title AND status IN ('pending','in_progress')) THEN
          INSERT INTO public.tasks(case_id,stage_id,title,status,priority,assigned_to,due_date,created_by)
            VALUES(c.id,target.id,task_title,'pending',c.priority,p_assigned_to,due::date,actor);
        END IF;
      END LOOP;
    END IF;
  ELSE
    UPDATE public.tasks SET assigned_to=p_assigned_to,updated_at=now()
      WHERE case_id=c.id AND status IN ('pending','in_progress');
  END IF;
  INSERT INTO public.activities(case_id,customer_id,user_id,action,description,metadata)
    VALUES(c.id,c.customer_id,actor,'case_handoff','Moved to '||target.name||'. '||coalesce(p_notes,'')||CASE WHEN moving AND (jsonb_array_length(unmet)>0 OR skipping) THEN ' [Manager override: '||trim(p_override_reason)||']' ELSE '' END,
      jsonb_build_object('from_status',c.status,'to_status',p_status,'from_assigned_to',c.assigned_to,
        'to_assigned_to',p_assigned_to,'completed_task_ids',p_complete_task_ids,
        'override_reason',CASE WHEN moving AND (jsonb_array_length(unmet)>0 OR skipping) THEN trim(p_override_reason) ELSE NULL END,
        'overridden_checks',CASE WHEN moving THEN unmet ELSE '[]'::jsonb END));
  IF p_assigned_to<>actor AND (moving OR c.assigned_to IS DISTINCT FROM p_assigned_to) THEN
    INSERT INTO public.notifications(user_id,title,message,type,link,related_case_id)
      VALUES(p_assigned_to,'New handoff: '||c.case_number,target.name||'. '||coalesce(p_notes,''),'info','/cases/'||c.id,c.id);
  END IF;
  PERFORM set_config('app.case_workflow_write','',true);
  RETURN jsonb_build_object('success',true);
END $$;

CREATE OR REPLACE FUNCTION public.set_case_work_flag(p_case_id UUID,p_expected_updated_at TIMESTAMPTZ,
  p_flag TEXT,p_reason TEXT DEFAULT '',p_owner_id UUID DEFAULT NULL,p_follow_up_date DATE DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.cases; actor UUID:=auth.uid();
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active) THEN RAISE EXCEPTION 'Active employee required'; END IF;
  SELECT * INTO STRICT c FROM public.cases WHERE id=p_case_id FOR UPDATE;
  IF c.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Case changed. Refresh and retry.'; END IF;
  IF p_flag NOT IN ('none','waiting','blocked') THEN RAISE EXCEPTION 'Invalid flag'; END IF;
  IF p_flag<>'none' AND (length(trim(coalesce(p_reason,'')))=0 OR p_follow_up_date IS NULL OR
    NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_owner_id AND is_active)) THEN
    RAISE EXCEPTION 'Provide a reason, responsible person and follow-up date'; END IF;
  PERFORM set_config('app.case_workflow_write',c.id::text,true);
  UPDATE public.cases SET work_flag=p_flag,flag_reason=CASE WHEN p_flag='none' THEN NULL ELSE trim(p_reason) END,
    flag_owner_id=CASE WHEN p_flag='none' THEN NULL ELSE p_owner_id END,
    follow_up_date=CASE WHEN p_flag='none' THEN NULL ELSE p_follow_up_date END,updated_at=now() WHERE id=c.id;
  INSERT INTO public.activities(case_id,customer_id,user_id,action,description,metadata)
    VALUES(c.id,c.customer_id,actor,'case_flag',CASE WHEN p_flag='none' THEN 'Waiting / blocked flag resolved'
      ELSE p_flag||': '||p_reason END,jsonb_build_object('from_flag',c.work_flag,'to_flag',p_flag,
      'owner_id',p_owner_id,'follow_up_date',p_follow_up_date));
  IF p_flag<>'none' AND p_owner_id<>actor THEN
    INSERT INTO public.notifications(user_id,title,message,type,link,related_case_id)
      VALUES(p_owner_id,c.case_number||' needs your action',p_reason||' — follow up by '||p_follow_up_date,
        'warning','/cases/'||c.id,c.id);
  END IF;
  PERFORM set_config('app.case_workflow_write','',true);
END $$;

CREATE OR REPLACE FUNCTION public.accept_case_handoff(p_case_id UUID,p_handoff_at TIMESTAMPTZ)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.cases;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Active employee required'; END IF;
  SELECT * INTO STRICT c FROM public.cases WHERE id=p_case_id FOR UPDATE;
  IF c.assigned_to IS DISTINCT FROM auth.uid() OR c.handoff_at IS DISTINCT FROM p_handoff_at THEN
    RAISE EXCEPTION 'This handoff is no longer assigned to you. Refresh the queue.'; END IF;
  IF c.handoff_accepted_at IS NOT NULL THEN RETURN; END IF;
  PERFORM set_config('app.case_workflow_write',c.id::text,true);
  UPDATE public.cases SET handoff_accepted_at=now(),updated_at=now() WHERE id=c.id;
  INSERT INTO public.activities(case_id,user_id,action,description)
    VALUES(c.id,auth.uid(),'handoff_accepted','Employee accepted the handoff');
  PERFORM set_config('app.case_workflow_write','',true);
END $$;

REVOKE ALL ON FUNCTION public.case_completion_checks(UUID) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.complete_case_handoff(UUID,TIMESTAMPTZ,TEXT,UUID,TEXT,UUID[],BOOLEAN,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_case_work_flag(UUID,TIMESTAMPTZ,TEXT,TEXT,UUID,DATE) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.accept_case_handoff(UUID,TIMESTAMPTZ) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.case_completion_checks(UUID),public.complete_case_handoff(UUID,TIMESTAMPTZ,TEXT,UUID,TEXT,UUID[],BOOLEAN,TEXT),
  public.set_case_work_flag(UUID,TIMESTAMPTZ,TEXT,TEXT,UUID,DATE),public.accept_case_handoff(UUID,TIMESTAMPTZ) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_business_dashboard_metrics_v6(
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
    'new_cases', COUNT(*) FILTER (WHERE status IN ('lead', 'new')),
    'active_cases', COUNT(*) FILTER (WHERE status NOT IN ('closed', 'completed', 'cancelled')),
    'completed_cases', COUNT(*) FILTER (WHERE status IN ('closed', 'completed')),
    'blocked_cases', COUNT(*) FILTER (WHERE (work_flag = 'blocked' OR status = 'blocked')),
    'overdue_cases', COUNT(*) FILTER (WHERE stage_due_date < NOW() AND status NOT IN ('closed', 'completed', 'cancelled')),
    'total_loan_amount', COALESCE(SUM(loan_amount), 0),
    'active_loan_amount', COALESCE(SUM(loan_amount) FILTER (WHERE status NOT IN ('closed', 'completed', 'cancelled')), 0),
    'completed_loan_amount', COALESCE(SUM(loan_amount) FILTER (WHERE status IN ('closed', 'completed')), 0)
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
      COUNT(c.id) FILTER (WHERE c.stage_due_date < NOW() AND c.status NOT IN ('closed', 'completed', 'cancelled')) AS overdue_count,
      ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at))/86400), 0)::numeric, 1) AS avg_duration_days
    FROM workflow_stages ws
    LEFT JOIN cases c ON c.current_stage_id = ws.id
      AND (p_building_id IS NULL OR c.building_id = p_building_id)
      AND (p_start_date IS NULL OR c.created_at >= p_start_date)
      AND (p_end_date IS NULL OR c.created_at <= p_end_date)
      AND c.status NOT IN ('closed', 'completed', 'cancelled')
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
      COUNT(c.id) FILTER (WHERE c.status NOT IN ('closed', 'completed', 'cancelled')) AS active_cases,
      COUNT(c.id) FILTER (WHERE c.status IN ('closed', 'completed')) AS completed_cases,
      COUNT(c.id) FILTER (WHERE (c.work_flag = 'blocked' OR c.status = 'blocked')) AS blocked_cases,
      COUNT(c.id) FILTER (WHERE c.stage_due_date < NOW() AND c.status NOT IN ('closed', 'completed', 'cancelled')) AS overdue_cases,
      COALESCE(SUM(c.loan_amount), 0) AS total_loan_value,
      ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (c.updated_at - c.created_at))/86400) FILTER (WHERE c.status IN ('closed', 'completed')), 0)::numeric, 1) AS avg_completion_days
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
      COUNT(c.id) FILTER (WHERE c.status NOT IN ('closed', 'completed', 'cancelled')) AS active_cases,
      COUNT(c.id) AS total_assigned_cases,
      COUNT(c.id) FILTER (WHERE c.status IN ('closed', 'completed')) AS completed_cases,
      (
        SELECT COUNT(*) FROM tasks t 
        WHERE t.assigned_to = p.id AND t.status IN ('pending', 'in_progress')
      ) AS open_tasks,
      (
        SELECT COUNT(*) FROM tasks t 
        WHERE t.assigned_to = p.id AND t.status IN ('pending', 'in_progress') AND t.due_date < CURRENT_DATE
      ) AS overdue_tasks,
      ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (c.updated_at - c.created_at))/86400) FILTER (WHERE c.status IN ('closed', 'completed')), 0)::numeric, 1) AS avg_turnaround_days
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

GRANT EXECUTE ON FUNCTION public.get_business_dashboard_metrics_v6 TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
