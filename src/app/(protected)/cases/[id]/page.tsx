'use client';

import { getCaseStatusOptions, getCaseStatusLabel, normalizeCaseStatus } from '@/lib/case-status';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { PageSkeleton } from '@/components/ui/Skeleton';
import CaseForm from '@/components/cases/CaseForm';
import { CasePdfButton } from '@/components/cases/CaseExportButtons';
import CaseFlagControl from '@/components/cases/CaseFlagControl';
import CaseHandoffModal from '@/components/cases/CaseHandoffModal';
import CaseDocumentManager from '@/components/documents/CaseDocumentManager';
import CaseCommentSection from '@/components/cases/CaseCommentSection';
import { formatDate, formatDateTime, capitalize, getStatusColor, getPriorityColor, formatINR } from '@/lib/utils';
import type { Case, WorkflowStage, Activity, Task, CaseStageHistory, Profile, CaseStatus } from '@/types';
import {
  ArrowLeft,
  Pencil,
  User,
  Calendar,
  Briefcase,
  FileText,
  Clock,
  UserCheck,
  Tag,
  CheckCircle2,
  Circle,
  ArrowRight,
  ArrowLeftRight,
  ListTodo,
  AlertTriangle,
  ChevronRight,
  Check,
  Plus,
  Building2,
  UserPlus,
  Banknote,
  Landmark,
} from 'lucide-react';

export default function CaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();
  const caseId = params.id as string;

  // Data states
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stageHistory, setStageHistory] = useState<CaseStageHistory[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // UI Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [handoffTarget, setHandoffTarget] = useState<string | undefined>();

  // Reassignment Modal State
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);

  // Quick Task Creation Modal
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState('');

  const fetchAllData = useCallback(async () => {
    try {
      const [caseRes, stagesRes, activitiesRes, tasksRes, historyRes, employeesRes] =
        await Promise.all([
          supabase
            .from('cases')
            .select(`
              *,
              customer:customers(*),
              building:buildings(*),
              assigned_profile:profiles!cases_assigned_to_fkey(*),
              current_stage:workflow_stages(*)
            `)
            .eq('id', caseId)
            .single(),
          supabase.from('workflow_stages').select('*').eq('is_active', true).order('display_order', { ascending: true }),
          supabase
            .from('activities')
            .select(`*, user:profiles(id, full_name)`)
            .eq('case_id', caseId)
            .order('created_at', { ascending: false }),
          supabase
            .from('tasks')
            .select(`*, assigned_profile:profiles!tasks_assigned_to_fkey(id, full_name)`)
            .eq('case_id', caseId)
            .order('created_at', { ascending: false }),
          supabase
            .from('case_stage_history')
            .select(`
              *,
              from_stage:workflow_stages!case_stage_history_from_stage_id_fkey(id, name, color),
              to_stage:workflow_stages!case_stage_history_to_stage_id_fkey(id, name, color),
              changed_by_profile:profiles!case_stage_history_changed_by_fkey(id, full_name),
              assigned_profile:profiles!case_stage_history_assigned_to_fkey(id, full_name)
            `)
            .eq('case_id', caseId)
            .order('created_at', { ascending: false }),
          supabase.from('profiles').select('*').eq('is_active', true),
        ]);

      if (caseRes.error) throw caseRes.error;

      setCaseData(caseRes.data as Case);
      setStages((stagesRes.data ?? []) as WorkflowStage[]);
      setActivities((activitiesRes.data ?? []) as Activity[]);
      setTasks((tasksRes.data ?? []) as Task[]);
      setStageHistory((historyRes.data ?? []) as CaseStageHistory[]);
      setEmployees((employeesRes.data ?? []) as Profile[]);
    } catch {
      toast('Failed to load case details', 'error');
      router.push('/cases');
    }
  }, [supabase, caseId, toast, router]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      await fetchAllData();
      setIsLoading(false);
    }
    load();
  }, [fetchAllData]);

  if (isLoading) return <PageSkeleton />;
  if (!caseData) return null;

  // Active stages sorted by display order
  const activeStages = stages.filter((stage) => stage.status_code).sort((a, b) => a.display_order - b.display_order);
  const currentStageIndex = activeStages.findIndex((s) => s.id === caseData.current_stage_id);
  const currentStage = activeStages[currentStageIndex] || caseData.current_stage;

  const previousStage = currentStageIndex > 0 ? activeStages[currentStageIndex - 1] : null;
  const nextStage = currentStageIndex >= 0 && currentStageIndex < activeStages.length - 1 ? activeStages[currentStageIndex + 1] : null;

  const handleOpenChangeStageModal = (target?: WorkflowStage) => {
    setHandoffTarget(target?.status_code || undefined);
    setIsReassignModalOpen(true);
  };
  const handleAttemptTransition = handleOpenChangeStageModal;
  const handleStatusChange = (status: CaseStatus) => {
    setHandoffTarget(status);
    setIsReassignModalOpen(true);
  };

  // Toggle Task Completion
  const handleToggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus, completed_at: completedAt, updated_at: new Date().toISOString() })
        .eq('id', task.id);

      if (error) throw error;

      await supabase.from('activities').insert({
        case_id: caseId,
        user_id: user?.id,
        action: 'task_update',
        description: `Task "${task.title}" marked as ${newStatus}`,
      });

      toast(`Task marked as ${newStatus}`, 'success');
      fetchAllData();
    } catch {
      toast('Failed to update task', 'error');
    }
  };

  // Quick Task Create
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !user) return;

    try {
      const { error } = await supabase.from('tasks').insert({
        case_id: caseId,
        stage_id: currentStage?.id,
        title: newTaskTitle.trim(),
        status: 'pending',
        priority: caseData.priority || 'medium',
        assigned_to: newTaskAssignedTo || caseData.assigned_to || user.id,
        created_by: user.id,
      });

      if (error) throw error;
      toast('Task added to case', 'success');
      setIsTaskModalOpen(false);
      setNewTaskTitle('');
      fetchAllData();
    } catch {
      toast('Failed to create task', 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push('/cases')}
            className="rounded-lg p-2.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer mt-1"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-white font-mono tracking-tight">{caseData.case_number}</h1>

              {/* Status Selector Dropdown */}
              <select
                value={normalizeCaseStatus(caseData.status)}
                onChange={(e) => handleStatusChange(e.target.value as CaseStatus)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold focus:outline-none cursor-pointer ${getStatusColor(
                  caseData.status
                )}`}
              >
                {getCaseStatusOptions(caseData.status).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getPriorityColor(
                  caseData.priority
                )}`}
              >
                {capitalize(caseData.priority)} Priority
              </span>
            </div>

            <div className="text-sm text-slate-400 mt-1 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1">
                Customer:
                {caseData.customer ? (
                  <Link
                    href={`/customers/${caseData.customer.id}`}
                    className="text-indigo-400 font-medium hover:underline ml-1"
                  >
                    {caseData.customer.full_name}
                  </Link>
                ) : (
                  <span className="text-slate-400 ml-1">Unassigned</span>
                )}
              </span>
              {caseData.building && (
                <>
                  <span>·</span>
                  <span className="text-indigo-300 font-medium flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {caseData.building.name}
                  </span>
                </>
              )}
              {caseData.loan_amount && (
                <>
                  <span>·</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatINR(caseData.loan_amount)}
                  </span>
                </>
              )}
              {caseData.bank_name && (
                <>
                  <span>·</span>
                  <span className="text-slate-300 flex items-center gap-1">
                    <Landmark className="h-3.5 w-3.5 text-indigo-400" />
                    {caseData.bank_name}
                  </span>
                </>
              )}
              <span>·</span>
              <span className="text-slate-500 font-mono text-xs">
                Created {formatDate(caseData.created_at)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <CasePdfButton caseId={caseId} />
          <Button variant="secondary" onClick={() => setIsFormOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit Case
          </Button>
        </div>
      </div>

      {/* WORKFLOW PROGRESS VISUALIZER */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-6 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Briefcase className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Workflow Stage Progress</h2>
              <p className="text-xs text-slate-400">
                Current Stage:{' '}
                <span className="font-semibold text-indigo-400">{currentStage?.name || 'Unassigned'}</span>
              </p>
            </div>
          </div>

          {/* Quick Stage Controls */}
          <div className="flex items-center gap-2">
            {previousStage && (role === 'owner' || role === 'manager') && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleAttemptTransition(previousStage)}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Move Back
              </Button>
            )}

            {nextStage && (
              <Button
                size="sm"
                onClick={() => handleAttemptTransition(nextStage)}
              >
                Complete & Handoff
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleOpenChangeStageModal()}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Change Stage
            </Button>
          </div>
        </div>

        {/* Horizontal Workflow Track */}
        <div className="overflow-x-auto pb-2">
          <div className="flex items-center min-w-[700px] justify-between relative px-2">
            {activeStages.map((stage, idx) => {
              const isPassed = idx < currentStageIndex;
              const isCurrent = idx === currentStageIndex;

              return (
                <div key={stage.id} className="flex-1 flex items-center relative group">
                  {/* Connector Line */}
                  {idx > 0 && (
                    <div
                      className={`h-1 flex-1 -ml-2 -mr-2 transition-all ${
                        idx <= currentStageIndex ? 'bg-indigo-500' : 'bg-slate-800'
                      }`}
                    />
                  )}

                  {/* Node */}
                  <div
                    onClick={() => handleOpenChangeStageModal(stage)}
                    className="relative z-10 flex flex-col items-center cursor-pointer transition-transform hover:scale-105"
                  >
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-xs shadow-lg transition-all ${
                        isCurrent
                          ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white ring-4 ring-indigo-500/20 scale-110'
                          : isPassed
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-500 border border-slate-700'
                      }`}
                    >
                      {isPassed ? <Check className="h-5 w-5" /> : idx + 1}
                    </div>

                    <span
                      className={`mt-2 text-xs font-medium text-center line-clamp-1 max-w-[100px] ${
                        isCurrent ? 'text-indigo-400 font-bold' : isPassed ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {stage.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <CaseFlagControl caseData={caseData} onSuccess={fetchAllData} />

      {/* Main Grid: Details & Side Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Case Overview & Employee Assignment */}
        <div className="lg:col-span-1 space-y-6">
          {/* Assigned Employee & SLA Card */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Assigned Employee & SLA
              </h3>
              <Button size="sm" variant="secondary" onClick={() => handleOpenChangeStageModal()}>
                <UserPlus className="h-3.5 w-3.5" />
                Complete & Handoff
              </Button>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/40 border border-slate-800">
              <div className="h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
                {caseData.assigned_profile ? caseData.assigned_profile.full_name[0] : '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {caseData.assigned_profile?.full_name || 'Unassigned'}
                </p>
                <p className="text-xs text-slate-400">Assigned Case Owner</p>
              </div>
            </div>

            <div className="space-y-3 pt-2 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-indigo-400" />
                  Stage SLA Target:
                </span>
                <span className="font-mono text-slate-200">{currentStage?.sla_days || 3} Days</span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-indigo-400" />
                  Stage Due Date:
                </span>
                <span className="font-mono text-indigo-300">
                  {caseData.stage_due_date ? formatDate(caseData.stage_due_date) : 'Not calculated'}
                </span>
              </div>
            </div>
          </div>

          {/* Financial & Loan Details Card */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Banknote className="h-4 w-4 text-emerald-400" />
                Loan & Financials
              </h3>
              {caseData.loan_amount != null && (
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {formatINR(caseData.loan_amount)}
                </span>
              )}
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 py-1 border-b border-slate-800/60">
                <div>
                  <p className="text-[11px] text-slate-500">Loan Amount</p>
                  <p className="font-semibold text-emerald-400 text-sm mt-0.5 font-mono">
                    {formatINR(caseData.loan_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Property Value</p>
                  <p className="font-semibold text-slate-200 text-sm mt-0.5 font-mono">
                    {formatINR(caseData.property_value)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 py-1 border-b border-slate-800/60 text-xs">
                <div>
                  <p className="text-[11px] text-slate-500">Loan Product</p>
                  <p className="font-medium text-slate-200 mt-0.5">
                    {caseData.loan_type || 'Home Loan'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Bank / Lender</p>
                  <p className="font-medium text-indigo-300 mt-0.5 flex items-center gap-1">
                    <Landmark className="h-3 w-3 text-indigo-400 shrink-0" />
                    <span className="truncate">{caseData.bank_name || 'Not specified'}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 text-xs">
                <div>
                  <p className="text-[11px] text-slate-500">Interest Rate</p>
                  <p className="font-mono text-slate-200 mt-0.5">
                    {caseData.interest_rate != null ? `${caseData.interest_rate}% p.a.` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Tenure</p>
                  <p className="font-mono text-slate-200 mt-0.5">
                    {caseData.loan_tenure_months
                      ? `${caseData.loan_tenure_months} M (${(caseData.loan_tenure_months / 12).toFixed(0)} Y)`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Ref #</p>
                  <p className="font-mono text-slate-300 mt-0.5 truncate" title={caseData.application_number || ''}>
                    {caseData.application_number || '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Case Information Overview */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-6 space-y-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Case Information
            </h3>

            <div className="space-y-3.5 text-sm">
              {/* Customer */}
              <div>
                <p className="text-xs text-slate-500">Customer</p>
                {caseData.customer ? (
                  <Link
                    href={`/customers/${caseData.customer.id}`}
                    className="font-medium text-indigo-400 hover:underline flex items-center gap-1.5 mt-0.5"
                  >
                    <User className="h-3.5 w-3.5" />
                    {caseData.customer.full_name}
                  </Link>
                ) : (
                  <p className="text-xs text-slate-400 mt-0.5">Unknown Customer</p>
                )}
                {caseData.customer?.phone && (
                  <p className="text-[11px] text-slate-400 mt-0.5">{caseData.customer.phone}</p>
                )}
              </div>

              {/* Building / Project */}
              <div>
                <p className="text-xs text-slate-500">Building / Project</p>
                {caseData.building ? (
                  <div className="flex items-center gap-1.5 mt-0.5 font-medium text-indigo-300">
                    <Building2 className="h-4 w-4 text-indigo-400 shrink-0" />
                    <span>{caseData.building.name}</span>
                    {caseData.building.code && (
                      <span className="text-xs text-slate-500 font-mono">
                        ({caseData.building.code})
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 mt-0.5">No building / project linked</p>
                )}
              </div>

              {/* Case Type & Priority */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-slate-500">Case Type</p>
                  <p className="font-medium text-slate-200 mt-0.5">{capitalize(caseData.case_type)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Priority</p>
                  <span
                    className={`inline-block mt-0.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${getPriorityColor(
                      caseData.priority
                    )}`}
                  >
                    {capitalize(caseData.priority)}
                  </span>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/60">
                <div>
                  <p className="text-[11px] text-slate-500">Created Date</p>
                  <p className="text-slate-300 font-mono mt-0.5">{formatDate(caseData.created_at)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Expected Completion</p>
                  <p className="text-slate-300 font-mono mt-0.5">
                    {caseData.expected_completion_date
                      ? formatDate(caseData.expected_completion_date)
                      : 'Not set'}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-xs text-slate-500">Description</p>
                <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap leading-relaxed">
                  {caseData.description || 'No description provided.'}
                </p>
              </div>

              {/* Notes */}
              {caseData.notes && (
                <div>
                  <p className="text-xs text-slate-500">Internal Notes</p>
                  <p className="text-xs text-slate-400 mt-1 whitespace-pre-wrap">{caseData.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Stage Tasks, Documents, Comments & History */}
        <div className="lg:col-span-2 space-y-6">
          {/* STAGE TASKS SECTION */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <ListTodo className="h-4 w-4 text-indigo-400" />
                Stage Tasks ({tasks.filter((t) => t.status === 'completed').length}/{tasks.length})
              </div>
              <Button variant="secondary" size="sm" onClick={() => setIsTaskModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add Task
              </Button>
            </div>

            {tasks.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                No tasks generated for this case yet. Tasks are auto-created when entering a stage.
              </p>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      task.status === 'completed'
                        ? 'border-slate-800/40 bg-slate-950/40 text-slate-500 line-through'
                        : 'border-slate-800 bg-slate-900/60 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleTaskStatus(task)}
                        className="cursor-pointer text-indigo-400 hover:text-indigo-300"
                      >
                        {task.status === 'completed' ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <Circle className="h-5 w-5 text-slate-500 hover:text-slate-300" />
                        )}
                      </button>
                      <div>
                        <p className="text-xs font-medium">{task.title}</p>
                        {task.due_date && (
                          <p className="text-[10px] text-slate-500">
                            Due: {formatDate(task.due_date)} · Assigned to: {task.assigned_profile?.full_name || 'Staff'}
                          </p>
                        )}
                      </div>
                    </div>

                    <Badge variant={task.status === 'completed' ? 'success' : 'default'}>
                      {task.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* DOCUMENT MANAGEMENT SECTION */}
          <CaseDocumentManager
            caseId={caseId}
            caseNumber={caseData.case_number}
            currentStageId={caseData.current_stage_id}
            assignedTo={caseData.assigned_to}
            onActivityLogged={fetchAllData}
          />

          {/* CASE COMMENTS & DISCUSSION */}
          <CaseCommentSection
            caseId={caseId}
            caseNumber={caseData.case_number}
            customerId={caseData.customer_id}
            onCommentAdded={fetchAllData}
          />

          {/* CHRONOLOGICAL TIMELINE (Activities & Stage Transitions) */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800/60 pb-3 text-white font-semibold text-sm">
              <Clock className="h-4 w-4 text-indigo-400" />
              Activity & Stage History Timeline
            </div>

            {activities.length === 0 && stageHistory.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No history recorded yet.</p>
            ) : (
              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                {activities.map((act) => (
                  <div key={act.id} className="relative flex items-start gap-3">
                    <div className="absolute -left-6 top-1 h-3 w-3 rounded-full bg-indigo-500 ring-4 ring-slate-950" />
                    <div>
                      <p className="text-xs font-medium text-slate-200">{act.description}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {act.user?.full_name || 'System'} · {formatDateTime(act.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CREATE TASK MODAL */}
      <Modal isOpen={isTaskModalOpen} onClose={() => setIsTaskModalOpen(false)} title="Add Task to Case">
        <form onSubmit={handleCreateTask} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Task Title</label>
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="e.g. Call customer to confirm bank details"
              className="w-full rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Assign To {role === 'employee' ? '(Locked to Case Owner)' : ''}
            </label>
            <select
              value={newTaskAssignedTo}
              onChange={(e) => setNewTaskAssignedTo(e.target.value)}
              disabled={role === 'employee'}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">Current Case Owner</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsTaskModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Task</Button>
          </div>
        </form>
      </Modal>

      {isReassignModalOpen && (
        <CaseHandoffModal
          key={caseData.id}
          caseData={caseData}
          initialStatus={handoffTarget}
          onClose={() => setIsReassignModalOpen(false)}
          onSuccess={fetchAllData}
        />
      )}
      {/* EDIT CASE FORM */}
      <CaseForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={fetchAllData}
        caseData={caseData}
      />
    </div>
  );
}
