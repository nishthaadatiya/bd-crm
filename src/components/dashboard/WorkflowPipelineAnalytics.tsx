'use client';

import { useRouter } from 'next/navigation';
import { formatINR } from '@/lib/utils';
import type { StagePipelineMetric } from '@/types';
import { Layers, Clock, AlertTriangle, ArrowRight, ChevronRight } from 'lucide-react';

interface WorkflowPipelineAnalyticsProps {
  pipeline: StagePipelineMetric[];
  buildingId: string | null;
}

export default function WorkflowPipelineAnalytics({
  pipeline,
  buildingId,
}: WorkflowPipelineAnalyticsProps) {
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

  const totalActivePipelineCases = pipeline.reduce((acc, s) => acc + Number(s.case_count || 0), 0);
  const totalActivePipelineCapital = pipeline.reduce((acc, s) => acc + Number(s.total_loan_amount || 0), 0);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Live Workflow Stage Pipeline</h2>
            <p className="text-xs text-slate-400">
              Active case throughput, capital volume, and SLA compliance per stage
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="text-slate-400">
            Active Cases:{' '}
            <span className="font-bold text-white">{totalActivePipelineCases}</span>
          </div>
          <div className="text-slate-400">
            Active Capital:{' '}
            <span className="font-bold text-emerald-400">{formatINR(totalActivePipelineCapital)}</span>
          </div>
        </div>
      </div>

      {/* Horizontal Pipeline Funnel Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {pipeline.map((stage, idx) => {
          const hasOverdue = Number(stage.overdue_count || 0) > 0;
          return (
            <div
              key={stage.stage_id}
              onClick={() => handleStageClick(stage.stage_id)}
              className="group relative flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-700 hover:shadow-md cursor-pointer"
            >
              {/* Header: Stage Order & Color Indicator */}
              <div>
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold font-mono"
                    style={{
                      backgroundColor: `${stage.stage_color}20`,
                      color: stage.stage_color,
                    }}
                  >
                    #{idx + 1}
                  </span>

                  <span className="text-[10px] text-slate-500 font-mono">
                    SLA: {stage.sla_days}d
                  </span>
                </div>

                <h3 className="text-xs font-semibold text-slate-200 group-hover:text-indigo-400 transition-colors line-clamp-1" title={stage.stage_name}>
                  {stage.stage_name}
                </h3>

                {/* Case Count & Loan Volume */}
                <div className="mt-3 space-y-1">
                  <p className="text-lg font-bold font-mono text-white">
                    {stage.case_count} <span className="text-xs font-normal text-slate-400">cases</span>
                  </p>
                  <p className="text-xs font-mono font-medium text-emerald-400 truncate">
                    {formatINR(stage.total_loan_amount)}
                  </p>
                </div>
              </div>

              {/* Footer: Turnaround & SLA Alert */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1 text-[11px]">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1 text-[10px]">
                    <Clock className="h-3 w-3 text-slate-500" />
                    Avg:
                  </span>
                  <span className="font-mono text-slate-300 font-medium">
                    {stage.avg_duration_days}d
                  </span>
                </div>

                {hasOverdue ? (
                  <div className="flex items-center justify-between text-rose-400 font-medium bg-rose-500/10 px-1.5 py-0.5 rounded text-[10px]">
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Overdue:
                    </span>
                    <span className="font-mono font-bold">{stage.overdue_count}</span>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-500 text-right">
                    On track
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
