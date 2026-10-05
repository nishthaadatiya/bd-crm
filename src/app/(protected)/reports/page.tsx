'use client';

import EmptyState from '@/components/ui/EmptyState';
import { BarChart3 } from 'lucide-react';

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Reports</h1>
        <p className="mt-1 text-sm text-slate-400">
          Analytics and business insights
        </p>
      </div>

      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-8">
        <EmptyState
          icon={<BarChart3 className="h-8 w-8 text-slate-500" />}
          title="Reports & Analytics"
          description="Reporting module will be available in future updates."
        />
      </div>
    </div>
  );
}
