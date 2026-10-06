'use client';

import { useRouter } from 'next/navigation';
import { formatINR } from '@/lib/utils';
import type { DashboardKPIs } from '@/types';
import {
  Briefcase,
  Sparkles,
  Activity,
  CheckCircle2,
  AlertOctagon,
  ClockAlert,
  Banknote,
  TrendingUp,
  Award,
  ChevronRight,
} from 'lucide-react';

interface KPICardGridProps {
  kpis: DashboardKPIs;
  buildingId: string | null;
}

export default function KPICardGrid({ kpis, buildingId }: KPICardGridProps) {
  const router = useRouter();

  const handleDrilldown = (queryParams: Record<string, string>) => {
    const params = new URLSearchParams(queryParams);
    if (buildingId) {
      params.set('building', buildingId);
    }
    router.push(`/cases?${params.toString()}`);
  };

  const cards = [
    {
      label: 'Total Cases',
      value: kpis.total_cases,
      isCurrency: false,
      subtext: 'Across selected scope',
      icon: Briefcase,
      color: 'text-indigo-400',
      gradient: 'from-indigo-500/20 to-purple-500/10',
      border: 'border-indigo-500/30 hover:border-indigo-500/60',
      onClick: () => handleDrilldown({ status: 'all' }),
    },
    {
      label: 'Leads',
      value: kpis.new_cases,
      isCurrency: false,
      subtext: 'Pending initial review',
      icon: Sparkles,
      color: 'text-blue-400',
      gradient: 'from-blue-500/20 to-cyan-500/10',
      border: 'border-blue-500/30 hover:border-blue-500/60',
      onClick: () => handleDrilldown({ status: 'lead' }),
    },
    {
      label: 'Active Cases',
      value: kpis.active_cases,
      isCurrency: false,
      subtext: 'Lead through Payout',
      icon: Activity,
      color: 'text-amber-400',
      gradient: 'from-amber-500/20 to-orange-500/10',
      border: 'border-amber-500/30 hover:border-amber-500/60',
      onClick: () => handleDrilldown({ status: 'active' }),
    },
    {
      label: 'Closed Cases',
      value: kpis.completed_cases,
      isCurrency: false,
      subtext: 'Successfully closed',
      icon: CheckCircle2,
      color: 'text-emerald-400',
      gradient: 'from-emerald-500/20 to-teal-500/10',
      border: 'border-emerald-500/30 hover:border-emerald-500/60',
      onClick: () => handleDrilldown({ status: 'closed' }),
    },
    {
      label: 'Blocked Cases',
      value: kpis.blocked_cases,
      isCurrency: false,
      subtext: 'Requires intervention',
      icon: AlertOctagon,
      color: 'text-rose-400',
      gradient: 'from-rose-500/20 to-red-500/10',
      border: 'border-rose-500/30 hover:border-rose-500/60',
      onClick: () => handleDrilldown({ flag: 'blocked' }),
    },
    {
      label: 'Overdue Cases',
      value: kpis.overdue_cases,
      isCurrency: false,
      subtext: 'SLA deadline breached',
      icon: ClockAlert,
      color: 'text-red-400',
      gradient: 'from-red-600/20 to-rose-700/10',
      border: 'border-red-500/40 hover:border-red-500/80',
      highlight: kpis.overdue_cases > 0,
      onClick: () => handleDrilldown({ overdue: 'true' }),
    },
    {
      label: 'Total Loan Volume',
      value: kpis.total_loan_amount,
      isCurrency: true,
      subtext: 'Total Capital Requested',
      icon: Banknote,
      color: 'text-cyan-400',
      gradient: 'from-cyan-500/20 to-blue-600/10',
      border: 'border-cyan-500/30 hover:border-cyan-500/60',
      onClick: () => handleDrilldown({ status: 'all' }),
    },
    {
      label: 'Active Pipeline Capital',
      value: kpis.active_loan_amount,
      isCurrency: true,
      subtext: 'Active cases in progress',
      icon: TrendingUp,
      color: 'text-emerald-400',
      gradient: 'from-emerald-500/20 to-green-600/10',
      border: 'border-emerald-500/30 hover:border-emerald-500/60',
      onClick: () => handleDrilldown({ status: 'active' }),
    },
    {
      label: 'Completed Loan Capital',
      value: kpis.completed_loan_amount,
      isCurrency: true,
      subtext: 'Closed cases',
      icon: Award,
      color: 'text-purple-400',
      gradient: 'from-purple-500/20 to-indigo-600/10',
      border: 'border-purple-500/30 hover:border-purple-500/60',
      onClick: () => handleDrilldown({ status: 'closed' }),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            onClick={card.onClick}
            className={`group relative rounded-xl border ${card.border} bg-gradient-to-br ${card.gradient} bg-slate-900/60 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer overflow-hidden`}
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {card.label}
                </span>
                <p className={`text-2xl font-bold font-mono tracking-tight text-white`}>
                  {card.isCurrency ? formatINR(card.value) : card.value.toLocaleString('en-IN')}
                </p>
                <p className="text-[11px] text-slate-400 font-medium">{card.subtext}</p>
              </div>

              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 border border-slate-700/60 ${card.color} shadow-sm group-hover:scale-105 transition-transform`}
              >
                <Icon className="h-5 w-5" />
              </div>
            </div>

            {/* Drilldown Arrow on Hover */}
            <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800/40 text-[11px] text-slate-400 group-hover:text-slate-200 transition-colors">
              <span>View details</span>
              <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
