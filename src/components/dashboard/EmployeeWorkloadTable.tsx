'use client';

import { useRouter } from 'next/navigation';
import type { EmployeeWorkloadMetric } from '@/types';
import { Users, CheckCircle, Clock, AlertCircle, ChevronRight } from 'lucide-react';

interface EmployeeWorkloadTableProps {
  employees: EmployeeWorkloadMetric[];
}

export default function EmployeeWorkloadTable({ employees }: EmployeeWorkloadTableProps) {
  const router = useRouter();

  if (!employees || employees.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Employee Workload & Capacity</h2>
            <p className="text-xs text-slate-400">Active assignments, open tasks, and completion pace</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 text-center py-8">
          No employee workload records found for the selected scope.
        </p>
      </div>
    );
  }

  const getCapacityBadge = (activeCases: number, openTasks: number) => {
    const score = activeCases * 2 + openTasks;
    if (score > 12) {
      return {
        label: 'Heavy Load',
        classes: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      };
    }
    if (score >= 5) {
      return {
        label: 'Balanced',
        classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      };
    }
    return {
      label: 'Available',
      classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    };
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Employee Workload & Capacity</h2>
            <p className="text-xs text-slate-400">
              Active case assignments, open operational tasks, and SLA adherence by staff
            </p>
          </div>
        </div>

        <span className="text-xs text-slate-400 font-mono">
          {employees.length} Staff Members
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-medium uppercase tracking-wider">
              <th className="py-2.5 px-3">Team Member</th>
              <th className="py-2.5 px-3">Role</th>
              <th className="py-2.5 px-3 text-right">Active Cases</th>
              <th className="py-2.5 px-3 text-right">Open Tasks</th>
              <th className="py-2.5 px-3 text-right">Overdue Tasks</th>
              <th className="py-2.5 px-3 text-right">Completed Cases</th>
              <th className="py-2.5 px-3 text-right">Avg Turnaround</th>
              <th className="py-2.5 px-3 text-center">Load Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {employees.map((emp) => {
              const capacity = getCapacityBadge(emp.active_cases, emp.open_tasks);

              return (
                <tr
                  key={emp.employee_id}
                  onClick={() => router.push(`/cases?assigned=${emp.employee_id}`)}
                  className="group hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-3">
                    <div>
                      <p className="font-medium text-white group-hover:text-indigo-400 transition-colors">
                        {emp.employee_name || 'Staff Member'}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate max-w-[180px]">
                        {emp.employee_email}
                      </p>
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                      {emp.role_name}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-right font-mono font-semibold text-amber-400">
                    {emp.active_cases}
                  </td>

                  <td className="py-3 px-3 text-right font-mono text-slate-200">
                    {emp.open_tasks}
                  </td>

                  <td className="py-3 px-3 text-right font-mono">
                    {emp.overdue_tasks > 0 ? (
                      <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                        <AlertCircle className="h-3 w-3" />
                        {emp.overdue_tasks}
                      </span>
                    ) : (
                      <span className="text-slate-500">0</span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-right font-mono text-emerald-400 font-medium">
                    {emp.completed_cases}
                  </td>

                  <td className="py-3 px-3 text-right font-mono text-slate-300">
                    {emp.avg_turnaround_days > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {emp.avg_turnaround_days}d
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${capacity.classes}`}
                    >
                      {capacity.label}
                    </span>
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
