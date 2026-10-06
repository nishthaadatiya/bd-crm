'use client';

import { isActiveCase, getCaseStatusLabel } from '@/lib/case-status';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { formatDate, capitalize, getPriorityColor, getStatusColor, formatINR } from '@/lib/utils';
import type { Task, Case } from '@/types';
import {
  ListTodo,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  Briefcase,
  User,
  Check,
  Search,
  Building2,
  FolderSync,
  AlertOctagon,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

type DashboardTab =
  | 'tasks_today'
  | 'tasks_overdue'
  | 'tasks_upcoming'
  | 'tasks_completed'
  | 'cases_active'
  | 'cases_waiting'
  | 'cases_blocked';

export default function OperationalDashboardPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [myCases, setMyCases] = useState<Case[]>([]);
  const [activeTab, setActiveTab] = useState<DashboardTab>('tasks_today');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [tasksRes, casesRes] = await Promise.all([
        supabase
          .from('tasks')
          .select(`
            *,
            assigned_profile:profiles!tasks_assigned_to_fkey(id, full_name),
            case:cases!tasks_case_id_fkey(
              id,
              case_number,
              priority,
              status,
              customer:customers(id, full_name),
              building:buildings(id, name, code)
            ),
            stage:workflow_stages!tasks_stage_id_fkey(id, name, color)
          `)
          .eq('assigned_to', user.id)
          .order('due_date', { ascending: true, nullsFirst: false }),
        supabase
          .from('cases')
          .select(`
            *,
            customer:customers(id, full_name, email, phone),
            building:buildings(id, name, code),
            current_stage:workflow_stages(id, name, color),
            assigned_profile:profiles!cases_assigned_to_fkey(id, full_name)
          `)
          .eq('assigned_to', user.id)
          .order('stage_due_date', { ascending: true, nullsFirst: false }),
      ]);

      if (tasksRes.error) throw tasksRes.error;
      setTasks((tasksRes.data ?? []) as Task[]);
      setMyCases((casesRes.data ?? []) as Case[]);
    } catch {
      toast('Failed to load dashboard data', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user, toast]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleUpdateStatus = async (task: Task, newStatus: 'in_progress' | 'completed' | 'pending') => {
    setUpdatingTaskId(task.id);
    const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;

    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: newStatus,
          completed_at: completedAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      if (error) throw error;

      if (task.case_id) {
        await supabase.from('activities').insert({
          case_id: task.case_id,
          user_id: user?.id,
          action: 'task_update',
          description: `Task "${task.title}" updated to status "${capitalize(newStatus)}"`,
        });
      }

      toast(`Task marked as ${capitalize(newStatus)}`, 'success');
      await fetchDashboardData();
    } catch {
      toast('Failed to update task status', 'error');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Categorize Tasks & Cases
  const todayStr = new Date().toISOString().split('T')[0];

  const tasksDueToday = tasks.filter(
    (t) =>
      t.status !== 'completed' &&
      (!t.due_date || t.due_date.split('T')[0] === todayStr || t.status === 'in_progress')
  );

  const tasksOverdue = tasks.filter(
    (t) => t.status !== 'completed' && t.due_date && t.due_date.split('T')[0] < todayStr
  );

  const tasksUpcoming = tasks.filter(
    (t) => t.status !== 'completed' && t.due_date && t.due_date.split('T')[0] > todayStr
  );

  const tasksCompleted = tasks.filter((t) => t.status === 'completed');

  const myActiveCases = myCases.filter(
    (c) => isActiveCase(c.status)
  );

  const casesWaitingForDocs = myCases.filter(
    (c) => c.work_flag === 'waiting' || c.status === 'waiting'
  );

  const casesBlocked = myCases.filter(
    (c) => c.work_flag === 'blocked' || c.status === 'blocked'
  );

  // Filter based on active tab & search query
  const q = searchQuery.toLowerCase().trim();

  const isTaskTab = activeTab.startsWith('tasks_');

  const filteredTasks = (() => {
    let list: Task[] = [];
    if (activeTab === 'tasks_today') list = tasksDueToday;
    else if (activeTab === 'tasks_overdue') list = tasksOverdue;
    else if (activeTab === 'tasks_upcoming') list = tasksUpcoming;
    else if (activeTab === 'tasks_completed') list = tasksCompleted;

    if (!q) return list;
    return list.filter((t) => {
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchCase = t.case?.case_number.toLowerCase().includes(q);
      const matchCustomer = t.case?.customer?.full_name.toLowerCase().includes(q);
      const matchBuilding = t.case?.building?.name.toLowerCase().includes(q);
      return matchTitle || matchCase || matchCustomer || matchBuilding;
    });
  })();

  const filteredCases = (() => {
    let list: Case[] = [];
    if (activeTab === 'cases_active') list = myActiveCases;
    else if (activeTab === 'cases_waiting') list = casesWaitingForDocs;
    else if (activeTab === 'cases_blocked') list = casesBlocked;

    if (!q) return list;
    return list.filter((c) => {
      const matchNumber = c.case_number.toLowerCase().includes(q);
      const matchCustomer = c.customer?.full_name.toLowerCase().includes(q);
      const matchBuilding = c.building?.name.toLowerCase().includes(q);
      const matchType = c.case_type.toLowerCase().includes(q);
      return matchNumber || matchCustomer || matchBuilding || matchType;
    });
  })();

  const getPriorityVariant = (priority: string): 'default' | 'success' | 'warning' | 'danger' | 'info' => {
    switch (priority) {
      case 'urgent':
        return 'danger';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      default:
        return 'default';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ListTodo className="h-6 w-6 text-indigo-400" />
            Operational Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Your personal operational hub for assigned tasks and customer cases
          </p>
        </div>
      </div>

      <Link href="/work-queue" className="block rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-indigo-300">Open My Work Queue — new handoffs, due today and overdue work →</Link>

      {/* Operational KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setActiveTab('tasks_today')}
          className={`text-left rounded-xl border p-4 transition-all cursor-pointer ${
            activeTab === 'tasks_today'
              ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
              : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-400">Tasks Due Today</p>
            <Clock className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-1">{tasksDueToday.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">Requires action today</p>
        </button>

        <button
          onClick={() => setActiveTab('tasks_overdue')}
          className={`text-left rounded-xl border p-4 transition-all cursor-pointer ${
            activeTab === 'tasks_overdue'
              ? 'border-red-500 bg-red-500/10 shadow-lg shadow-red-500/10'
              : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-400">Overdue Tasks</p>
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </div>
          <p className="text-2xl font-bold text-red-400 mt-1">{tasksOverdue.length}</p>
          <p className="text-[11px] text-red-400/70 mt-1">Past SLA deadline</p>
        </button>

        <button
          onClick={() => setActiveTab('cases_active')}
          className={`text-left rounded-xl border p-4 transition-all cursor-pointer ${
            activeTab === 'cases_active'
              ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
              : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-400">My Active Cases</p>
            <Briefcase className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-indigo-400 mt-1">{myActiveCases.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">Under active management</p>
        </button>

        <button
          onClick={() => setActiveTab(casesBlocked.length > 0 ? 'cases_blocked' : 'cases_waiting')}
          className={`text-left rounded-xl border p-4 transition-all cursor-pointer ${
            activeTab === 'cases_waiting' || activeTab === 'cases_blocked'
              ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10'
              : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-400">Waiting / Blocked</p>
            <FolderSync className="h-4 w-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-amber-400">{casesWaitingForDocs.length}</span>
            {casesBlocked.length > 0 && (
              <span className="text-xs font-semibold text-rose-400">({casesBlocked.length} blocked)</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Waiting on customer / partner</p>
        </button>
      </div>

      {/* Navigation Tabs and Search */}
      <div className="space-y-3 border-b border-slate-800/80 pb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Tab Categories */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-2">
              My Tasks:
            </div>
            <button
              onClick={() => setActiveTab('tasks_today')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'tasks_today'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Today ({tasksDueToday.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('tasks_overdue')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'tasks_overdue'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Overdue ({tasksOverdue.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('tasks_upcoming')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'tasks_upcoming'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Upcoming ({tasksUpcoming.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('tasks_completed')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'tasks_completed'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Completed ({tasksCompleted.length})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search tasks, cases, buildings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-1.5 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* My Cases Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-2">
            My Cases:
          </div>
          <button
            onClick={() => setActiveTab('cases_active')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'cases_active'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span>Active Cases ({myActiveCases.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('cases_waiting')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'cases_waiting'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <FolderSync className="h-3.5 w-3.5" />
            <span>Waiting for Documents ({casesWaitingForDocs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('cases_blocked')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'cases_blocked'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <AlertOctagon className="h-3.5 w-3.5" />
            <span>Blocked Cases ({casesBlocked.length})</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
          <TableSkeleton rows={5} cols={6} />
        </div>
      ) : isTaskTab ? (
        /* TASKS VIEW */
        filteredTasks.length === 0 ? (
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-8">
            <EmptyState
              icon={<ListTodo className="h-8 w-8 text-slate-500" />}
              title="No tasks in this view"
              description={
                searchQuery
                  ? 'No tasks match your search filter'
                  : 'You are all caught up on tasks in this category'
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className={`rounded-xl border p-4 transition-all ${
                  task.status === 'completed'
                    ? 'border-slate-800/50 bg-slate-950/40 opacity-70'
                    : task.due_date && task.due_date.split('T')[0] < todayStr
                    ? 'border-red-500/30 bg-red-950/10 hover:border-red-500/50'
                    : 'border-slate-800/80 bg-slate-900/50 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Status Toggle Button */}
                      <button
                        onClick={() =>
                          handleUpdateStatus(
                            task,
                            task.status === 'completed' ? 'pending' : 'completed'
                          )
                        }
                        disabled={updatingTaskId === task.id}
                        className="cursor-pointer text-slate-400 hover:text-indigo-400 transition-colors"
                        title={task.status === 'completed' ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {task.status === 'completed' ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border-2 border-slate-600 hover:border-indigo-400 flex items-center justify-center" />
                        )}
                      </button>

                      <p
                        className={`text-sm font-semibold truncate ${
                          task.status === 'completed' ? 'line-through text-slate-500' : 'text-white'
                        }`}
                      >
                        {task.title}
                      </p>

                      <Badge variant={getPriorityVariant(task.priority)}>
                        {capitalize(task.priority)}
                      </Badge>

                      {task.status !== 'completed' && task.due_date && task.due_date.split('T')[0] < todayStr && (
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                          OVERDUE
                        </span>
                      )}
                    </div>

                    {/* Metadata Line: Case, Customer, Building, Stage, Due Date */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pl-7">
                      {task.case && (
                        <Link
                          href={`/cases/${task.case.id}`}
                          className="font-mono text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                        >
                          <Briefcase className="h-3 w-3" />
                          {task.case.case_number}
                        </Link>
                      )}

                      {task.case?.customer && (
                        <span className="flex items-center gap-1 text-slate-300">
                          <User className="h-3 w-3 text-slate-500" />
                          {task.case.customer.full_name}
                        </span>
                      )}

                      {task.case?.building && (
                        <span className="flex items-center gap-1 text-indigo-300">
                          <Building2 className="h-3 w-3 text-indigo-400" />
                          {task.case.building.name}
                        </span>
                      )}

                      {task.stage && (
                        <span className="flex items-center gap-1">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: task.stage.color || '#6366f1' }}
                          />
                          {task.stage.name}
                        </span>
                      )}

                      {task.due_date && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <Calendar className="h-3 w-3 text-slate-500" />
                          Due: {formatDate(task.due_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Link */}
                  {task.case && (
                    <Link
                      href={`/cases/${task.case.id}`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white transition-colors shrink-0 self-end md:self-center"
                    >
                      <span>Open Case</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* CASES VIEW (Active, Waiting for Docs, Blocked) */
        filteredCases.length === 0 ? (
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-8">
            <EmptyState
              icon={<Briefcase className="h-8 w-8 text-slate-500" />}
              title="No cases in this category"
              description="No assigned cases currently match this status filter"
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900/40 shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/60 text-xs font-semibold text-slate-400 uppercase tracking-wider text-left">
                    <th className="px-5 py-3.5">Case Number</th>
                    <th className="px-5 py-3.5">Customer</th>
                    <th className="px-5 py-3.5">Building / Project</th>
                    <th className="px-5 py-3.5">Current Stage</th>
                    <th className="px-5 py-3.5">Priority</th>
                    <th className="px-5 py-3.5">Stage Due Date</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {filteredCases.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-bold text-indigo-400">
                        <Link href={`/cases/${c.id}`} className="hover:underline">
                          {c.case_number}
                        </Link>
                        {c.loan_amount && (
                          <span className="block text-[11px] font-mono font-semibold text-emerald-400">
                            {formatINR(c.loan_amount)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-200">
                        {c.customer ? (
                          <div>
                            <p className="font-medium">{c.customer.full_name}</p>
                            {c.customer.phone && (
                              <p className="text-[11px] text-slate-500">{c.customer.phone}</p>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-300">
                        {c.building ? (
                          <span className="flex items-center gap-1.5 text-indigo-300 font-medium">
                            <Building2 className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                            {c.building.name}
                            {c.building.code && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                ({c.building.code})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {c.current_stage ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-200 font-medium">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: c.current_stage.color || '#6366f1' }}
                            />
                            {c.current_stage.name}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={getPriorityVariant(c.priority)}>{capitalize(c.priority)}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-xs font-mono text-slate-300">
                        {c.stage_due_date ? formatDate(c.stage_due_date) : '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusColor(
                            c.status
                          )}`}
                        >
                          {getCaseStatusLabel(c.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/cases/${c.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white transition-colors"
                        >
                          <span>Open</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
