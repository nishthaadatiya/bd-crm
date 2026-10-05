'use client';

import Link from 'next/link';
import { AlertCircle, Clock, AlertOctagon, FileWarning, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import type { AttentionItem } from '@/types';

interface AttentionRequiredPanelProps {
  items: AttentionItem[];
}

export default function AttentionRequiredPanel({ items }: AttentionRequiredPanelProps) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Attention Required Queue</h2>
            <p className="text-xs text-slate-400">Cases and tasks needing immediate operational intervention</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
          <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-2">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-slate-300">All Operations Clear</p>
          <p className="text-xs text-slate-500 max-w-sm mt-0.5">
            No overdue deadlines, blocked workflows, or document escalations detected within current scope.
          </p>
        </div>
      </div>
    );
  }

  const getBadge = (type: AttentionItem['type']) => {
    switch (type) {
      case 'overdue':
        return {
          icon: Clock,
          label: 'SLA Overdue',
          classes: 'bg-red-500/10 text-red-400 border-red-500/20',
        };
      case 'blocked':
        return {
          icon: AlertOctagon,
          label: 'Case Blocked',
          classes: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        };
      case 'waiting_docs':
        return {
          icon: FileWarning,
          label: 'Waiting Docs',
          classes: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        };
      case 'approaching_deadline':
        return {
          icon: AlertCircle,
          label: 'Due Soon',
          classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        };
      default:
        return {
          icon: AlertCircle,
          label: 'Action Needed',
          classes: 'bg-slate-700 text-slate-300 border-slate-600',
        };
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <AlertCircle className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Attention Required Queue</h2>
            <p className="text-xs text-slate-400">
              {items.length} {items.length === 1 ? 'case requires' : 'cases require'} executive intervention or unblocking
            </p>
          </div>
        </div>

        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
          {items.length} Urgent
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
        {items.map((item) => {
          const badge = getBadge(item.type);
          const BadgeIcon = badge.icon;

          return (
            <Link
              key={item.id}
              href={`/cases/${item.id}`}
              className="group relative flex flex-col justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-4 transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/70"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-indigo-400 group-hover:underline">
                    {item.case_number}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${badge.classes}`}
                  >
                    <BadgeIcon className="h-3 w-3" />
                    {badge.label}
                  </span>
                </div>

                <div>
                  <p className="text-sm font-semibold text-white truncate">{item.customer_name}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    {item.building_name && <span>{item.building_name}</span>}
                    {item.stage_name && (
                      <>
                        <span>•</span>
                        <span className="text-slate-300">{item.stage_name}</span>
                      </>
                    )}
                  </p>
                </div>

                <p className="text-xs text-slate-300 bg-slate-900/80 rounded px-2.5 py-1.5 border border-slate-800/80">
                  {item.detail}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800/50 text-[11px]">
                {item.due_date ? (
                  <span className="text-rose-400 font-mono font-medium">
                    Due: {new Date(item.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </span>
                ) : (
                  <span className="text-slate-500">Immediate action</span>
                )}

                <span className="inline-flex items-center gap-0.5 text-indigo-400 group-hover:text-indigo-300 font-medium">
                  Review Case
                  <ArrowUpRight className="h-3 w-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
