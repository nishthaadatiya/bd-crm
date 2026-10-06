'use client';

import { isActiveCase, isClosedCase, getCaseStatusLabel, TERMINAL_CASE_STATUSES } from '@/lib/case-status';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import DashboardFilterBar, { computeDatePresetBounds } from '@/components/dashboard/DashboardFilterBar';
import KPICardGrid from '@/components/dashboard/KPICardGrid';
import WorkflowPipelineAnalytics from '@/components/dashboard/WorkflowPipelineAnalytics';
import AttentionRequiredPanel from '@/components/dashboard/AttentionRequiredPanel';
import ProjectPerformanceTable from '@/components/dashboard/ProjectPerformanceTable';
import EmployeeWorkloadTable from '@/components/dashboard/EmployeeWorkloadTable';
import BottlenecksTable from '@/components/dashboard/BottlenecksTable';
import LoanAnalyticsCharts from '@/components/dashboard/LoanAnalyticsCharts';
import type {
  Building,
  DashboardFilterState,
  DashboardKPIs,
  StagePipelineMetric,
  ProjectPerformanceMetric,
  LoanByTypeMetric,
  EmployeeWorkloadMetric,
  AttentionItem,
  Task,
  Case,
} from '@/types';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ListTodo,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  Building2,
  Layers,
} from 'lucide-react';

export default function DashboardPage() {
  const { profile, role, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const isOwnerOrManager = ['owner', 'admin', 'manager'].includes(role || '');

  // Dynamic Buildings for Filter
  const [buildings, setBuildings] = useState<Building[]>([]);

  // Executive Filter State (Default: This Month)
  const initialBounds = computeDatePresetBounds('this_month');
  const [filterState, setFilterState] = useState<DashboardFilterState>({
    preset: 'this_month',
    startDate: initialBounds?.start ?? null,
    endDate: initialBounds?.end ?? null,
    buildingId: null,
  });

  // Business Analytics Data State
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<DashboardKPIs>({
    total_cases: 0,
    new_cases: 0,
    active_cases: 0,
    completed_cases: 0,
    blocked_cases: 0,
    overdue_cases: 0,
    total_loan_amount: 0,
    active_loan_amount: 0,
    completed_loan_amount: 0,
  });
  const [pipeline, setPipeline] = useState<StagePipelineMetric[]>([]);
  const [projects, setProjects] = useState<ProjectPerformanceMetric[]>([]);
  const [loanByType, setLoanByType] = useState<LoanByTypeMetric[]>([]);
  const [employees, setEmployees] = useState<EmployeeWorkloadMetric[]>([]);
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);

  // Employee-Specific Operational State
  const [myTasks, setMyTasks] = useState<{
    today: Task[];
    overdue: Task[];
    upcoming: Task[];
    completed: Task[];
  }>({ today: [], overdue: [], upcoming: [], completed: [] });
  const [myCases, setMyCases] = useState<Case[]>([]);

  // Fetch Generic Active Buildings
  useEffect(() => {
    async function loadBuildings() {
      try {
        const { data } = await supabase
          .from('buildings')
          .select('*')
          .eq('is_active', true)
          .order('name');
        if (data) setBuildings(data as Building[]);
      } catch (err) {
        console.error('Failed to load buildings filter list:', err);
      }
    }
    loadBuildings();
  }, [supabase]);

  // Executive Analytics Data Loader with Graceful Fallback
  const fetchExecutiveMetrics = useCallback(async () => {
    if (!isOwnerOrManager) return;
    setIsLoading(true);

    try {
      // 1. Try to invoke the fast, secure RPC function
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_business_dashboard_metrics_v6',
        {
          p_start_date: filterState.startDate,
          p_end_date: filterState.endDate,
          p_building_id: filterState.buildingId,
        }
      );

      if (!rpcError && rpcData) {
        setKpis(rpcData.kpis || {
          total_cases: 0,
          new_cases: 0,
          active_cases: 0,
          completed_cases: 0,
          blocked_cases: 0,
          overdue_cases: 0,
          total_loan_amount: 0,
          active_loan_amount: 0,
          completed_loan_amount: 0,
        });
        setPipeline(rpcData.pipeline || []);
        setProjects(rpcData.projects || []);
        setLoanByType(rpcData.loan_by_type || []);
        setEmployees(rpcData.employees || []);
      } else {
        // Fallback: Compute directly from tables if RPC is not yet applied
        await fetchFallbackMetrics();
      }

      // 2. Fetch Attention Required Queue (overdue, blocked, waiting for docs)
      let attentionQuery = supabase
        .from('cases')
        .select(`
          id,
          case_number,
          status,
          stage_due_date,
          customer:customers(full_name),
          building:buildings(name),
          work_flag, flag_reason, follow_up_date,
          stage:workflow_stages(name)
        `)
        .or('work_flag.eq.blocked,work_flag.eq.waiting,status.eq.blocked,status.eq.waiting,stage_due_date.lt.now(),follow_up_date.lte.today')
        .not('status', 'in', TERMINAL_CASE_STATUSES)
        .limit(20);

      if (filterState.buildingId) {
        attentionQuery = attentionQuery.eq('building_id', filterState.buildingId);
      }

      const { data: attData } = await attentionQuery;
      if (attData) {
        const formatted: AttentionItem[] = attData.map((c: any) => {
          const isOverdue = c.stage_due_date && new Date(c.stage_due_date) < new Date();
          let type: AttentionItem['type'] = 'approaching_deadline';
          let detail = 'Requires review';

          if ((c.work_flag === 'blocked' || c.status === 'blocked')) {
            type = 'blocked';
            detail = c.flag_reason || 'Workflow is blocked and requires management clearance';
          } else if (isOverdue) {
            type = 'overdue';
            detail = 'SLA deadline exceeded for current stage';
          } else if (c.work_flag === 'waiting' || c.status === 'waiting') {
            type = 'waiting_docs';
            detail = c.flag_reason || 'Awaiting required customer or bank documentation';
          }

          return {
            id: c.id,
            case_number: c.case_number,
            customer_name: c.customer?.full_name || 'Customer',
            building_name: c.building?.name,
            stage_name: c.stage?.name,
            type,
            detail,
            due_date: c.stage_due_date,
          };
        });
        setAttentionItems(formatted);
      }
    } catch (err) {
      console.error('Failed to load executive metrics:', err);
      toast('Failed to load some dashboard metrics', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, isOwnerOrManager, filterState, toast]);

  // Fallback direct aggregation if RPC function isn't yet migrated
  const fetchFallbackMetrics = async () => {
    let casesQuery = supabase.from('cases').select(`
      id,
      status,
      loan_amount,
      loan_type,
      case_type,
      stage_due_date,
      work_flag,
      stage_entered_at,
      created_at,
      updated_at,
      building_id,
      current_stage_id,
      assigned_to,
      building:buildings(id, name, code)
    `);

    if (filterState.buildingId) {
      casesQuery = casesQuery.eq('building_id', filterState.buildingId);
    }
    if (filterState.startDate) {
      casesQuery = casesQuery.gte('created_at', filterState.startDate);
    }
    if (filterState.endDate) {
      casesQuery = casesQuery.lte('created_at', filterState.endDate);
    }

    const [casesRes, stagesRes, buildingsRes, profilesRes] = await Promise.all([
      casesQuery,
      supabase.from('workflow_stages').select('*').eq('is_active', true).order('display_order'),
      supabase.from('buildings').select('*').eq('is_active', true).order('name'),
      supabase.from('profiles').select('*, role:roles(*)').eq('is_active', true),
    ]);

    const caseList = casesRes.data || [];
    const stageList = stagesRes.data || [];
    const bldList = buildingsRes.data || [];
    const profileList = profilesRes.data || [];

    const now = new Date();

    // 1. KPIs
    let newCases = 0;
    let activeCases = 0;
    let completedCases = 0;
    let blockedCases = 0;
    let overdueCases = 0;
    let totalLoan = 0;
    let activeLoan = 0;
    let completedLoan = 0;

    caseList.forEach((c) => {
      const amt = Number(c.loan_amount) || 0;
      totalLoan += amt;

      if (['lead', 'new'].includes(c.status)) newCases++;
      if (isActiveCase(c.status)) {
        activeCases++;
        activeLoan += amt;
      }
      if (isClosedCase(c.status)) {
        completedCases++;
        completedLoan += amt;
      }
      if ((c.work_flag === 'blocked' || c.status === 'blocked')) blockedCases++;
      if (c.stage_due_date && new Date(c.stage_due_date) < now && isActiveCase(c.status)) {
        overdueCases++;
      }
    });

    setKpis({
      total_cases: caseList.length,
      new_cases: newCases,
      active_cases: activeCases,
      completed_cases: completedCases,
      blocked_cases: blockedCases,
      overdue_cases: overdueCases,
      total_loan_amount: totalLoan,
      active_loan_amount: activeLoan,
      completed_loan_amount: completedLoan,
    });

    // 2. Workflow Stage Pipeline
    const pipelineData: StagePipelineMetric[] = stageList.map((stg) => {
      const stgCases = caseList.filter(
        (c) => c.current_stage_id === stg.id && isActiveCase(c.status)
      );
      const stgLoan = stgCases.reduce((sum, c) => sum + (Number(c.loan_amount) || 0), 0);
      const stgOverdue = stgCases.filter(
        (c) => c.stage_due_date && new Date(c.stage_due_date) < now
      ).length;

      let avgDuration = 0;
      if (stgCases.length > 0) {
        const totalDurationDays = stgCases.reduce((sum, c) => {
          const start = c.stage_entered_at ? new Date(c.stage_entered_at).getTime() : new Date(c.created_at).getTime();
          return sum + (now.getTime() - start) / (1000 * 3600 * 24);
        }, 0);
        avgDuration = Math.round((totalDurationDays / stgCases.length) * 10) / 10;
      }

      return {
        stage_id: stg.id,
        stage_name: stg.name,
        stage_color: stg.color,
        display_order: stg.display_order,
        sla_days: stg.sla_days,
        case_count: stgCases.length,
        total_loan_amount: stgLoan,
        overdue_count: stgOverdue,
        avg_duration_days: avgDuration,
      };
    });
    setPipeline(pipelineData);

    // 3. Project Performance (100% database-driven)
    const projectData: ProjectPerformanceMetric[] = bldList
      .filter((b) => !filterState.buildingId || b.id === filterState.buildingId)
      .map((b) => {
        const bCases = caseList.filter((c) => c.building_id === b.id);
        const bActive = bCases.filter((c) => isActiveCase(c.status)).length;
        const bCompleted = bCases.filter((c) => isClosedCase(c.status));
        const bBlocked = bCases.filter((c) => (c.work_flag === 'blocked' || c.status === 'blocked')).length;
        const bOverdue = bCases.filter(
          (c) => c.stage_due_date && new Date(c.stage_due_date) < now && isActiveCase(c.status)
        ).length;
        const bLoan = bCases.reduce((sum, c) => sum + (Number(c.loan_amount) || 0), 0);

        let avgDays = 0;
        if (bCompleted.length > 0) {
          const totalDays = bCompleted.reduce((sum, c) => {
            const duration = (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / (1000 * 3600 * 24);
            return sum + Math.max(duration, 0);
          }, 0);
          avgDays = Math.round((totalDays / bCompleted.length) * 10) / 10;
        }

        return {
          building_id: b.id,
          building_name: b.name,
          building_code: b.code,
          total_cases: bCases.length,
          active_cases: bActive,
          completed_cases: bCompleted.length,
          blocked_cases: bBlocked,
          overdue_cases: bOverdue,
          total_loan_value: bLoan,
          avg_completion_days: avgDays,
        };
      })
      .sort((a, b) => b.total_loan_value - a.total_loan_value);
    setProjects(projectData);

    // 4. Loan by Type
    const loanMap: Record<string, { count: number; amount: number }> = {};
    caseList.forEach((c) => {
      const type = c.loan_type || c.case_type || 'General';
      if (!loanMap[type]) {
        loanMap[type] = { count: 0, amount: 0 };
      }
      loanMap[type].count += 1;
      loanMap[type].amount += Number(c.loan_amount) || 0;
    });

    const loanTypeData: LoanByTypeMetric[] = Object.entries(loanMap).map(([k, v]) => ({
      product_type: k,
      case_count: v.count,
      total_loan_amount: v.amount,
    })).sort((a, b) => b.total_loan_amount - a.total_loan_amount);
    setLoanByType(loanTypeData);

    // 5. Employee Workload
    const empData: EmployeeWorkloadMetric[] = profileList.map((p: any) => {
      const pCases = caseList.filter((c) => c.assigned_to === p.id);
      const pActive = pCases.filter((c) => isActiveCase(c.status)).length;
      const pCompleted = pCases.filter((c) => isClosedCase(c.status));

      return {
        employee_id: p.id,
        employee_name: p.full_name || 'Staff Member',
        employee_email: p.email || '',
        role_name: p.role?.name || 'employee',
        active_cases: pActive,
        total_assigned_cases: pCases.length,
        completed_cases: pCompleted.length,
        open_tasks: 0,
        overdue_tasks: 0,
        avg_turnaround_days: 0,
      };
    }).sort((a, b) => b.active_cases - a.active_cases);
    setEmployees(empData);
  };

  // Fetch Employee-Centric Dashboard Data if role is Employee
  useEffect(() => {
    if (isOwnerOrManager || !profile?.id) return;
    setIsLoading(true);

    async function fetchEmployeeWorkspace() {
      try {
        const todayStr = new Date().toISOString().split('T')[0];

        const [tasksRes, casesRes] = await Promise.all([
          supabase
            .from('tasks')
            .select(`
              *,
              case:cases(id, case_number, customer:customers(full_name), building:buildings(name))
            `)
            .eq('assigned_to', profile!.id)
            .order('due_date', { ascending: true }),
          supabase
            .from('cases')
            .select(`
              *,
              customer:customers(full_name),
              building:buildings(name),
              current_stage:workflow_stages(name, color)
            `)
            .eq('assigned_to', profile!.id)
            .order('created_at', { ascending: false }),
        ]);

        const allTasks = (tasksRes.data ?? []) as any[];
        const todayTasks = allTasks.filter(
          (t) => t.status !== 'completed' && t.due_date === todayStr
        );
        const overdueTasks = allTasks.filter(
          (t) => t.status !== 'completed' && t.due_date && t.due_date < todayStr
        );
        const upcomingTasks = allTasks.filter(
          (t) => t.status !== 'completed' && (!t.due_date || t.due_date > todayStr)
        );
        const completedTasks = allTasks.filter((t) => t.status === 'completed');

        setMyTasks({
          today: todayTasks,
          overdue: overdueTasks,
          upcoming: upcomingTasks,
          completed: completedTasks,
        });

        setMyCases((casesRes.data ?? []) as Case[]);
      } catch (err) {
        console.error('Failed to load employee workspace:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchEmployeeWorkspace();
  }, [isOwnerOrManager, profile?.id, supabase]);

  // Trigger metrics update whenever filters or permissions change
  useEffect(() => {
    if (isOwnerOrManager) {
      fetchExecutiveMetrics();
    }
  }, [isOwnerOrManager, fetchExecutiveMetrics]);

  // Auth Loading Screen
  if (authLoading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <div className="h-10 w-48 bg-slate-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW A: EMPLOYEE WORKSPACE DASHBOARD
  // ==========================================
  if (!isOwnerOrManager) {
    return (
      <div className="space-y-6 max-w-7xl">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase">
                Staff Workspace
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white">
              Welcome, {profile?.full_name?.split(' ')[0] || 'Team Member'}
            </h1>
            <p className="mt-0.5 text-sm text-slate-400">
              Here is your active workload: assigned tasks, upcoming deadlines, and cases.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/tasks"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm"
            >
              <ListTodo className="h-4 w-4" />
              Open Task Board
            </Link>
          </div>
        </div>

        {/* Operational Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                Overdue Tasks
              </span>
              <AlertTriangle className="h-4 w-4 text-red-400" />
            </div>
            <p className="text-2xl font-bold font-mono text-white">{myTasks.overdue.length}</p>
            <p className="text-[11px] text-slate-400">Action immediately</p>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Due Today
              </span>
              <Clock className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold font-mono text-white">{myTasks.today.length}</p>
            <p className="text-[11px] text-slate-400">Required completion today</p>
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                Upcoming Tasks
              </span>
              <ListTodo className="h-4 w-4 text-blue-400" />
            </div>
            <p className="text-2xl font-bold font-mono text-white">{myTasks.upcoming.length}</p>
            <p className="text-[11px] text-slate-400">Scheduled for later</p>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                Active Cases
              </span>
              <Briefcase className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold font-mono text-white">
              {myCases.filter((c) => isActiveCase(c.status)).length}
            </p>
            <p className="text-[11px] text-slate-400">Under your management</p>
          </div>
        </div>

        {/* Split Grid: Today's Tasks & My Active Cases */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section 1: My Immediate Tasks */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-indigo-400" />
                <h2 className="text-sm font-semibold text-white">Urgent & Today Tasks</h2>
              </div>
              <Link href="/tasks" className="text-xs text-indigo-400 hover:underline">
                View all
              </Link>
            </div>

            {myTasks.overdue.length === 0 && myTasks.today.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                No overdue or pending tasks for today. You are all caught up!
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {[...myTasks.overdue, ...myTasks.today].map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3 hover:border-slate-700 transition-colors"
                  >
                    <div>
                      <p className="text-xs font-semibold text-white">{task.title}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {task.case?.case_number} • {task.case?.customer?.full_name}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {task.due_date && (
                        <span className="text-[10px] font-mono text-rose-400">
                          Due: {task.due_date}
                        </span>
                      )}
                      <Link
                        href={`/cases/${task.case_id}`}
                        className="rounded p-1 text-slate-400 hover:text-white transition-colors"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: My Active Cases */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">My Assigned Cases</h2>
              </div>
              <Link href="/cases" className="text-xs text-indigo-400 hover:underline">
                View all cases
              </Link>
            </div>

            {myCases.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No cases currently assigned to you.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {myCases.slice(0, 6).map((c) => (
                  <Link
                    key={c.id}
                    href={`/cases/${c.id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3 hover:border-slate-700 hover:bg-slate-900/60 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-400">
                          {c.case_number}
                        </span>
                        <span className="text-xs text-white font-medium">
                          {c.customer?.full_name}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {c.building?.name || 'Project'} • Stage: {c.current_stage?.name || 'General'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        {getCaseStatusLabel(c.status)}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW B: OWNER / MANAGER BUSINESS DASHBOARD
  // ==========================================
  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Executive View • {role?.toUpperCase()}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Business Dashboard & Analytics
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Real-time pipeline visibility, project performance, loan portfolio, and team workload.
          </p>
        </div>
      </div>

      {/* Dynamic Date Range & Project Filter Bar */}
      <DashboardFilterBar
        filterState={filterState}
        onFilterChange={setFilterState}
        buildings={buildings}
        onRefresh={fetchExecutiveMetrics}
        isLoading={isLoading}
      />

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
          <TableSkeleton rows={4} cols={5} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. Nine Executive KPI Cards */}
          <KPICardGrid kpis={kpis} buildingId={filterState.buildingId} />

          {/* 2. Attention Required Queue */}
          <AttentionRequiredPanel items={attentionItems} />

          {/* 3. Live Workflow Stage Pipeline */}
          <WorkflowPipelineAnalytics
            pipeline={pipeline}
            buildingId={filterState.buildingId}
          />

          {/* 4. Workflow Bottlenecks & SLA Analysis */}
          <BottlenecksTable
            pipeline={pipeline}
            buildingId={filterState.buildingId}
          />

          {/* 5. Project Performance Table (Database-driven, No Profitability labeling) */}
          <ProjectPerformanceTable
            projects={projects}
            onSelectProject={(bldId) =>
              setFilterState((prev) => ({
                ...prev,
                buildingId: prev.buildingId === bldId ? null : bldId,
              }))
            }
          />

          {/* 6. Loan Capital & Project Concentration Analytics */}
          <LoanAnalyticsCharts
            loanByType={loanByType}
            projects={projects}
            buildingId={filterState.buildingId}
          />

          {/* 7. Team Workload & Staff Capacity */}
          <EmployeeWorkloadTable employees={employees} />
        </div>
      )}
    </div>
  );
}
