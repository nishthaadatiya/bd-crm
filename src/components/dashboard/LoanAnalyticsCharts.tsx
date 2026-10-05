'use client';

import { useRouter } from 'next/navigation';
import { formatINR } from '@/lib/utils';
import type { LoanByTypeMetric, ProjectPerformanceMetric } from '@/types';
import { PieChart, Landmark, Building2, ChevronRight } from 'lucide-react';

interface LoanAnalyticsChartsProps {
  loanByType: LoanByTypeMetric[];
  projects: ProjectPerformanceMetric[];
  buildingId: string | null;
}

export default function LoanAnalyticsCharts({
  loanByType,
  projects,
  buildingId,
}: LoanAnalyticsChartsProps) {
  const router = useRouter();

  const totalCapitalByProduct = loanByType.reduce(
    (acc, item) => acc + Number(item.total_loan_amount || 0),
    0
  );

  const totalCapitalByProject = projects.reduce(
    (acc, item) => acc + Number(item.total_loan_value || 0),
    0
  );

  const handleProductClick = (productType: string) => {
    const params = new URLSearchParams({ search: productType });
    if (buildingId) {
      params.set('building', buildingId);
    }
    router.push(`/cases?${params.toString()}`);
  };

  const handleProjectClick = (projId: string) => {
    router.push(`/cases?building=${projId}`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 1. Loan Volume by Product / Loan Type */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <PieChart className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Loan Product Distribution</h2>
              <p className="text-xs text-slate-400">Capital requested and case volume by loan category</p>
            </div>
          </div>
          <span className="text-xs font-mono text-cyan-300 font-semibold">
            {formatINR(totalCapitalByProduct)}
          </span>
        </div>

        {loanByType.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8">
            No loan product records found for selected filter scope.
          </p>
        ) : (
          <div className="space-y-3">
            {loanByType.map((item) => {
              const percentage =
                totalCapitalByProduct > 0
                  ? Math.round((Number(item.total_loan_amount) / totalCapitalByProduct) * 100)
                  : 0;

              return (
                <div
                  key={item.product_type}
                  onClick={() => handleProductClick(item.product_type)}
                  className="group rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 hover:border-slate-700 cursor-pointer transition-colors space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white group-hover:text-cyan-400 transition-colors">
                      {item.product_type}
                    </span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-400">{item.case_count} cases</span>
                      <span className="font-bold text-cyan-300">
                        {formatINR(item.total_loan_amount)}
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden flex items-center">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(percentage, 2)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{percentage}% of capital volume</span>
                    <span className="flex items-center gap-0.5 text-slate-400 group-hover:text-cyan-300 transition-colors">
                      View cases
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Capital Volume by Project / Building */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Project Capital Concentration</h2>
              <p className="text-xs text-slate-400">Portfolio exposure and loan volume per project</p>
            </div>
          </div>
          <span className="text-xs font-mono text-indigo-300 font-semibold">
            {formatINR(totalCapitalByProject)}
          </span>
        </div>

        {projects.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8">
            No active project records found for selected filter scope.
          </p>
        ) : (
          <div className="space-y-3">
            {projects.slice(0, 5).map((proj) => {
              const percentage =
                totalCapitalByProject > 0
                  ? Math.round((Number(proj.total_loan_value) / totalCapitalByProject) * 100)
                  : 0;

              return (
                <div
                  key={proj.building_id}
                  onClick={() => handleProjectClick(proj.building_id)}
                  className="group rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 hover:border-slate-700 cursor-pointer transition-colors space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white group-hover:text-indigo-400 transition-colors truncate max-w-[180px]">
                      {proj.building_name}
                    </span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-400">{proj.total_cases} cases</span>
                      <span className="font-bold text-indigo-300">
                        {formatINR(proj.total_loan_value)}
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden flex items-center">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(percentage, 2)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{percentage}% of capital volume</span>
                    <span className="flex items-center gap-0.5 text-slate-400 group-hover:text-indigo-300 transition-colors">
                      Filter project
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
