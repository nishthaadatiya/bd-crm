'use client';

import { useRouter } from 'next/navigation';
import type { StagePipelineMetric } from '@/types';
import { Gauge, Clock, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';

interface BottlenecksTableProps {
  pipeline: StagePipelineMetric[];
  buildingId: string | null;
}

export default function BottlenecksTable({ pipeline, buildingId }: BottlenecksTableProps) {
  const router = useRouter();

  if (!pipeline || pipeline.length === 0) {
    return null;
  }

  const handleStageClick = (stageId: string) => {
    const params = new URLSearchParams({ stage: stageId });
    if (buildingId) {
      params.set('building', buildingId);
    }
    router.push(`/cases?${params.toString()}`);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Gauge className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Workflow Bottlenecks & SLA Analysis</h2>
            <p className="text-xs text-slate-400">
              Stage duration vs SLA benchmark, active case buildup, and breach rates
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-medium uppercase tracking-wider">
              <th className="py-2.5 px-3">Workflow Stage</th>
              <th className="py-2.5 px-3 text-right">SLA Target</th>
              <th className="py-2.5 px-3 text-right">Avg Duration</th>
              <th className="py-2.5 px-3 text-right">SLA Variance</th>
              <th className="py-2.5 px-3 text-right">Active In Stage</th>
              <th className="py-2.5 px-3 text-right">Overdue</th>
              <th className="py-2.5 px-3 text-right">Breach Rate</th>
              <th className="py-2.5 px-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {pipeline.map((stage) => {
              const caseCount = Number(stage.case_count || 0);
              const overdueCount = Number(stage.overdue_count || 0);
              const avgDuration = Number(stage.avg_duration_days || 0);
              const slaDays = Number(stage.sla_days || 0);

              const breachRate = caseCount > 0 ? Math.round((overdueCount / caseCount) * 100) : 0;
              const variance = avgDuration - slaDays;
              const isOverSla = slaDays > 0 && variance > 0 && caseCount > 0;

              let health = {
                label: 'Optimal',
                classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
              };

              if (breachRate > 30 || (isOverSla && variance >= 3)) {
                health = {
                  label: 'Bottleneck',
                  classes: 'bg-red-500/10 text-red-400 border-red-500/20',
                };
              } else if (breachRate > 10 || isOverSla) {
                health = {
                  label: 'At Risk',
                  classes: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                };
              }

              return (
                <tr
                  key={stage.stage_id}
                  onClick={() => handleStageClick(stage.stage_id)}
                  className="group hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: stage.stage_color || '#6366f1' }}
                      />
                      <span className="font-medium text-white group-hover:text-indigo-400 transition-colors">
                        {stage.stage_name}
                      </span>
                    </div>
                  </td>

                  <td className="py-3 px-3 text-right font-mono text-slate-300">
                    {slaDays > 0 ? `${slaDays}d` : '—'}
                  </td>

                  <td className="py-3 px-3 text-right font-mono text-slate-200">
                    {caseCount > 0 ? `${avgDuration}d` : '—'}
                  </td>

                  <td className="py-3 px-3 text-right font-mono">
                    {caseCount > 0 && slaDays > 0 ? (
                      <span className={isOverSla ? 'text-rose-400 font-semibold' : 'text-emerald-400'}>
                        {variance > 0 ? `+${variance.toFixed(1)}d` : `${variance.toFixed(1)}d`}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-right font-mono font-bold text-white">
                    {caseCount}
                  </td>

                  <td className="py-3 px-3 text-right font-mono">
                    {overdueCount > 0 ? (
                      <span className="text-rose-400 font-bold">{overdueCount}</span>
                    ) : (
                      <span className="text-slate-500">0</span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-right font-mono font-medium">
                    {caseCount > 0 ? (
                      <span className={breachRate > 0 ? 'text-rose-400' : 'text-slate-400'}>
                        {breachRate}%
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${health.classes}`}
                    >
                      {health.label}
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
