'use client';

import { isActiveCase, isClosedCase } from '@/lib/case-status';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import DashboardFilterBar, { computeDatePresetBounds } from '@/components/dashboard/DashboardFilterBar';
import ProjectPerformanceTable from '@/components/dashboard/ProjectPerformanceTable';
import LoanAnalyticsCharts from '@/components/dashboard/LoanAnalyticsCharts';
import BottlenecksTable from '@/components/dashboard/BottlenecksTable';
import EmployeeWorkloadTable from '@/components/dashboard/EmployeeWorkloadTable';
import { TableSkeleton } from '@/components/ui/Skeleton';
import type {
  Building,
  DashboardFilterState,
  StagePipelineMetric,
  ProjectPerformanceMetric,
  LoanByTypeMetric,
  EmployeeWorkloadMetric,
} from '@/types';
import { BarChart3, ShieldAlert, FileText, Download } from 'lucide-react';

export default function ReportsPage() {
  const { profile, role, isLoading: authLoading } = useAuth();
  const supabase = createClient();

  const isOwnerOrManager = ['owner', 'admin', 'manager'].includes(role || '');

  const [buildings, setBuildings] = useState<Building[]>([]);
  const initialBounds = computeDatePresetBounds('this_month');
  const [filterState, setFilterState] = useState<DashboardFilterState>({
    preset: 'this_month',
    startDate: initialBounds?.start ?? null,
    endDate: initialBounds?.end ?? null,
    buildingId: null,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [pipeline, setPipeline] = useState<StagePipelineMetric[]>([]);
  const [projects, setProjects] = useState<ProjectPerformanceMetric[]>([]);
  const [loanByType, setLoanByType] = useState<LoanByTypeMetric[]>([]);
  const [employees, setEmployees] = useState<EmployeeWorkloadMetric[]>([]);

  // Load generic active buildings
  useEffect(() => {
    async function loadBuildings() {
      const { data } = await supabase
        .from('buildings')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (data) setBuildings(data as Building[]);
    }
    loadBuildings();
  }, [supabase]);

  const fetchReportData = useCallback(async () => {
    if (!isOwnerOrManager) return;
    setIsLoading(true);

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_business_dashboard_metrics_v6',
        {
          p_start_date: filterState.startDate,
          p_end_date: filterState.endDate,
          p_building_id: filterState.buildingId,
        }
      );

      if (!rpcError && rpcData) {
        setPipeline(rpcData.pipeline || []);
        setProjects(rpcData.projects || []);
        setLoanByType(rpcData.loan_by_type || []);
        setEmployees(rpcData.employees || []);
      } else {
        // Fallback computation
        let casesQuery = supabase.from('cases').select('*');
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

        // Pipeline
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

        // Project Performance
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

        // Loan by type
        const loanMap: Record<string, { count: number; amount: number }> = {};
        caseList.forEach((c) => {
          const type = c.loan_type || c.case_type || 'General';
          if (!loanMap[type]) loanMap[type] = { count: 0, amount: 0 };
          loanMap[type].count += 1;
          loanMap[type].amount += Number(c.loan_amount) || 0;
        });

        setLoanByType(
          Object.entries(loanMap).map(([k, v]) => ({
            product_type: k,
            case_count: v.count,
            total_loan_amount: v.amount,
          })).sort((a, b) => b.total_loan_amount - a.total_loan_amount)
        );

        // Employees
        setEmployees(
          profileList.map((p: any) => {
            const pCases = caseList.filter((c) => c.assigned_to === p.id);
            return {
              employee_id: p.id,
              employee_name: p.full_name || 'Staff Member',
              employee_email: p.email || '',
              role_name: p.role?.name || 'employee',
              active_cases: pCases.filter((c) => isActiveCase(c.status)).length,
              total_assigned_cases: pCases.length,
              completed_cases: pCases.filter((c) => isClosedCase(c.status)).length,
              open_tasks: 0,
              overdue_tasks: 0,
              avg_turnaround_days: 0,
            };
          }).sort((a, b) => b.active_cases - a.active_cases)
        );
      }
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, isOwnerOrManager, filterState]);

  useEffect(() => {
    if (isOwnerOrManager) {
      fetchReportData();
    }
  }, [isOwnerOrManager, fetchReportData]);

  if (authLoading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <div className="h-10 w-48 bg-slate-800 rounded animate-pulse" />
        <TableSkeleton rows={6} cols={6} />
      </div>
    );
  }

  // Security guard for non-executives
  if (!isOwnerOrManager) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-12 text-center max-w-2xl mx-auto space-y-4 my-12">
        <div className="h-12 w-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-white">Access Restricted</h2>
        <p className="text-sm text-slate-400">
          Executive analytics and operational reports are only accessible by Owner and Manager accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Executive Reports
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Operational & Performance Reports
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Comprehensive audit of project performance, pipeline turnaround, and loan book distributions.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <DashboardFilterBar
        filterState={filterState}
        onFilterChange={setFilterState}
        buildings={buildings}
        onRefresh={fetchReportData}
        isLoading={isLoading}
      />

      {isLoading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : (
        <div className="space-y-6">
          {/* Project Performance Section */}
          <ProjectPerformanceTable
            projects={projects}
            onSelectProject={(bldId) =>
              setFilterState((prev) => ({
                ...prev,
                buildingId: prev.buildingId === bldId ? null : bldId,
              }))
            }
          />

          {/* Loan Capital Breakdown */}
          <LoanAnalyticsCharts
            loanByType={loanByType}
            projects={projects}
            buildingId={filterState.buildingId}
          />

          {/* Workflow Stage SLA Analysis */}
          <BottlenecksTable pipeline={pipeline} buildingId={filterState.buildingId} />

          {/* Staff Workload */}
          <EmployeeWorkloadTable employees={employees} />
        </div>
      )}
    </div>
  );
}
