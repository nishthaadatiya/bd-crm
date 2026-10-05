'use client';

import { useRouter } from 'next/navigation';
import { formatINR } from '@/lib/utils';
import type { ProjectPerformanceMetric } from '@/types';
import { Building2, ChevronRight, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ProjectPerformanceTableProps {
  projects: ProjectPerformanceMetric[];
  onSelectProject?: (buildingId: string) => void;
}

export default function ProjectPerformanceTable({
  projects,
  onSelectProject,
}: ProjectPerformanceTableProps) {
  const router = useRouter();

  if (!projects || projects.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Project Performance</h2>
            <p className="text-xs text-slate-400">Case volume, loan value, and SLA turnaround by project</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 text-center py-8">
          No project activity records found for the selected scope.
        </p>
      </div>
    );
  }

  const handleRowClick = (buildingId: string) => {
    if (onSelectProject) {
      onSelectProject(buildingId);
    } else {
      router.push(`/cases?building=${buildingId}`);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Project Performance</h2>
            <p className="text-xs text-slate-400">
              Aggregated case count, loan volume, and SLA turnaround across active projects
            </p>
          </div>
        </div>

        <span className="text-xs text-slate-400 font-mono">
          {projects.length} {projects.length === 1 ? 'Project' : 'Projects'} Active
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-medium uppercase tracking-wider">
              <th className="py-2.5 px-3">Project / Building</th>
              <th className="py-2.5 px-3 text-right">Total Cases</th>
              <th className="py-2.5 px-3 text-right">Active</th>
              <th className="py-2.5 px-3 text-right">Completed</th>
              <th className="py-2.5 px-3 text-right">Blocked / Overdue</th>
              <th className="py-2.5 px-3 text-right">Total Loan Value</th>
              <th className="py-2.5 px-3 text-right">Avg Turnaround</th>
              <th className="py-2.5 px-2 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {projects.map((proj) => {
              const hasAlerts = Number(proj.blocked_cases || 0) > 0 || Number(proj.overdue_cases || 0) > 0;

              return (
                <tr
                  key={proj.building_id}
                  onClick={() => handleRowClick(proj.building_id)}
                  className="group hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800 border border-slate-700/60 text-slate-300 font-mono text-[10px] font-bold">
                        {proj.building_code || proj.building_name.substring(0, 3).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-white group-hover:text-indigo-400 transition-colors">
                          {proj.building_name}
                        </p>
                        {proj.building_code && (
                          <span className="text-[10px] text-slate-400 font-mono">{proj.building_code}</span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-3 text-right font-mono font-semibold text-slate-200">
                    {proj.total_cases}
                  </td>

                  <td className="py-3 px-3 text-right font-mono text-amber-400">
                    {proj.active_cases}
                  </td>

                  <td className="py-3 px-3 text-right font-mono text-emerald-400">
                    {proj.completed_cases}
                  </td>

                  <td className="py-3 px-3 text-right font-mono">
                    {hasAlerts ? (
                      <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                        <AlertTriangle className="h-3 w-3" />
                        {proj.blocked_cases + proj.overdue_cases}
                      </span>
                    ) : (
                      <span className="text-slate-500">0</span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-right font-mono font-bold text-cyan-300">
                    {formatINR(proj.total_loan_value)}
                  </td>

                  <td className="py-3 px-3 text-right font-mono text-slate-300">
                    {proj.avg_completion_days > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {proj.avg_completion_days}d
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>

                  <td className="py-3 px-2 text-right text-slate-500 group-hover:text-slate-300">
                    <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
