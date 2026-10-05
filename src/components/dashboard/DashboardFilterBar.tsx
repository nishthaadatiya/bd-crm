'use client';

import { useState } from 'react';
import type { DashboardFilterState, DashboardDatePreset, Building } from '@/types';
import { Calendar, Building2, RefreshCw, Filter } from 'lucide-react';

interface DashboardFilterBarProps {
  filterState: DashboardFilterState;
  onFilterChange: (newState: DashboardFilterState) => void;
  buildings: Building[];
  onRefresh: () => void;
  isLoading: boolean;
}

export function computeDatePresetBounds(preset: DashboardDatePreset): { start: string; end: string } | null {
  const now = new Date();
  
  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (preset === 'this_week') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0);
    const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000 + (23 * 3600 + 59 * 60 + 59) * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (preset === 'this_quarter') {
    const qMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), qMonth, 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (preset === 'this_year') {
    const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  return null;
}

export default function DashboardFilterBar({
  filterState,
  onFilterChange,
  buildings,
  onRefresh,
  isLoading,
}: DashboardFilterBarProps) {
  const [customStart, setCustomStart] = useState(
    filterState.startDate ? filterState.startDate.split('T')[0] : ''
  );
  const [customEnd, setCustomEnd] = useState(
    filterState.endDate ? filterState.endDate.split('T')[0] : ''
  );

  const handlePresetSelect = (preset: DashboardDatePreset) => {
    if (preset === 'custom') {
      onFilterChange({
        ...filterState,
        preset: 'custom',
        startDate: customStart ? new Date(customStart).toISOString() : null,
        endDate: customEnd ? new Date(`${customEnd}T23:59:59`).toISOString() : null,
      });
      return;
    }

    const bounds = computeDatePresetBounds(preset);
    onFilterChange({
      ...filterState,
      preset,
      startDate: bounds ? bounds.start : null,
      endDate: bounds ? bounds.end : null,
    });
  };

  const handleCustomDateApply = (startStr: string, endStr: string) => {
    setCustomStart(startStr);
    setCustomEnd(endStr);
    if (startStr && endStr) {
      onFilterChange({
        ...filterState,
        preset: 'custom',
        startDate: new Date(startStr).toISOString(),
        endDate: new Date(`${endStr}T23:59:59`).toISOString(),
      });
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left Side: Filter Title & Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 mr-2">
            <Filter className="h-4 w-4 text-indigo-400" />
            <span>Filters:</span>
          </div>

          {/* Date Presets Dropdown */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            <select
              value={filterState.preset}
              onChange={(e) => handlePresetSelect(e.target.value as DashboardDatePreset)}
              className="bg-transparent text-xs font-medium text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="this_month">This Month</option>
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="last_month">Last Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="this_year">This Year</option>
              <option value="custom">Custom Date Range...</option>
            </select>
          </div>

          {/* Dynamic Project/Building Filter Dropdown */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5">
            <Building2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <select
              value={filterState.buildingId || 'all'}
              onChange={(e) =>
                onFilterChange({
                  ...filterState,
                  buildingId: e.target.value === 'all' ? null : e.target.value,
                })
              }
              className="bg-transparent text-xs font-medium text-slate-200 focus:outline-none cursor-pointer max-w-[200px] truncate"
            >
              <option value="all">All Projects</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.code ? `(${b.code})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Side: Refresh Button & Active Indicator */}
        <div className="flex items-center gap-2">
          {filterState.buildingId && (
            <button
              onClick={() => onFilterChange({ ...filterState, buildingId: null })}
              className="text-[11px] text-slate-400 hover:text-indigo-300 underline cursor-pointer"
            >
              Clear Project Filter
            </button>
          )}

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-800/80 hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh analytics data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Custom Date Range Pickers (only shown if 'custom' is active) */}
      {filterState.preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/60 text-xs text-slate-300">
          <span className="text-slate-400">Custom Range:</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => handleCustomDateApply(e.target.value, customEnd)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => handleCustomDateApply(customStart, e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
