'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/Skeleton';
import CaseForm from '@/components/cases/CaseForm';
import { formatDate, capitalize, getStatusColor, getPriorityColor, formatINR } from '@/lib/utils';
import type { Case, WorkflowStage, Profile, Building } from '@/types';
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Filter,
  Building2,
} from 'lucide-react';

const PAGE_SIZE = 10;

export default function CasesPage() {
  const supabase = createClient();
  const { toast } = useToast();

  const [cases, setCases] = useState<Case[]>([]);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');
  const [caseTypeFilter, setCaseTypeFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<Case | null>(null);
  const [deletingCase, setDeletingCase] = useState<Case | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function fetchMetadata() {
      try {
        const [stagesRes, empRes, buildingsRes] = await Promise.all([
          supabase.from('workflow_stages').select('*').order('display_order'),
          supabase.from('profiles').select('*').eq('is_active', true),
          supabase.from('buildings').select('*').order('name'),
        ]);
        setStages((stagesRes.data ?? []) as WorkflowStage[]);
        setEmployees((empRes.data ?? []) as Profile[]);
        setBuildings((buildingsRes.data ?? []) as Building[]);
      } catch {
        // Fallback gracefully
      }
    }
    fetchMetadata();
  }, [supabase]);

  const fetchCases = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('cases')
        .select(
          `
          *,
          customer:customers(id, full_name, email, phone),
          building:buildings(id, name, code),
          assigned_profile:profiles!cases_assigned_to_fkey(id, full_name),
          current_stage:workflow_stages(id, name, color)
        `,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const term = search.trim();
      if (term) {
        const [custRes, bldRes] = await Promise.all([
          supabase.from('customers').select('id').or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`),
          supabase.from('buildings').select('id').or(`name.ilike.%${term}%,code.ilike.%${term}%`),
        ]);

        const custIds = (custRes.data || []).map((c) => c.id);
        const bldIds = (bldRes.data || []).map((b) => b.id);

        const conditions: string[] = [
          `case_number.ilike.%${term}%`,
          `bank_name.ilike.%${term}%`,
          `application_number.ilike.%${term}%`,
          `description.ilike.%${term}%`,
        ];

        if (custIds.length > 0) {
          conditions.push(`customer_id.in.(${custIds.join(',')})`);
        }
        if (bldIds.length > 0) {
          conditions.push(`building_id.in.(${bldIds.join(',')})`);
        }

        query = query.or(conditions.join(','));
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (priorityFilter !== 'all') {
        query = query.eq('priority', priorityFilter);
      }

      if (stageFilter !== 'all') {
        query = query.eq('current_stage_id', stageFilter);
      }

      if (employeeFilter !== 'all') {
        query = query.eq('assigned_to', employeeFilter);
      }

      if (buildingFilter !== 'all') {
        query = query.eq('building_id', buildingFilter);
      }

      if (caseTypeFilter !== 'all') {
        query = query.eq('case_type', caseTypeFilter);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      setCases((data ?? []) as Case[]);
      setTotalCount(count ?? 0);
    } catch (error) {
      console.error('Error fetching cases:', error);
      toast('Failed to load cases', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [
    supabase,
    search,
    statusFilter,
    priorityFilter,
    stageFilter,
    employeeFilter,
    buildingFilter,
    caseTypeFilter,
    page,
    toast,
  ]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, priorityFilter, stageFilter, employeeFilter, buildingFilter, caseTypeFilter]);

  const handleDelete = async () => {
    if (!deletingCase) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('cases').delete().eq('id', deletingCase.id);

      if (error) throw error;
      toast('Case deleted successfully', 'success');
      setDeletingCase(null);
      fetchCases();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete case';
      toast(message, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Cases</h1>
          <p className="mt-1 text-sm text-slate-400">
            Track and manage workflow cases ({totalCount} total)
          </p>
        </div>
        <Button onClick={() => { setEditingCase(null); setIsFormOpen(true); }}>
          <Plus className="h-4 w-4" />
          New Case
        </Button>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by case #, customer, phone, project, bank..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-slate-400 mr-1">
            <Filter className="h-3.5 w-3.5" />
            <span>Filters:</span>
          </div>

          <select
            value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="all">All Buildings</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="all">All Stages</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="all">All Employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
              </option>
            ))}
          </select>

          <select
            value={caseTypeFilter}
            onChange={(e) => setCaseTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="all">All Case Types</option>
            <option value="general">General</option>
            <option value="home_loan">Home Loan</option>
            <option value="mortgage">Mortgage</option>
            <option value="consultation">Consultation</option>
            <option value="loan_application">Loan Application</option>
            <option value="service">Service</option>
            <option value="complaint">Complaint</option>
            <option value="follow_up">Follow Up</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting">Waiting</option>
            <option value="blocked">Blocked</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="all">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
          <TableSkeleton rows={5} cols={9} />
        </div>
      ) : cases.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-8 w-8 text-slate-500" />}
          title={search || statusFilter !== 'all' || buildingFilter !== 'all' ? 'No matching cases' : 'No cases found'}
          description={
            search || statusFilter !== 'all' || buildingFilter !== 'all'
              ? 'Try changing your search or filter parameters'
              : 'Create a case to start tracking customer progress'
          }
          action={
            !search && statusFilter === 'all'
              ? { label: 'New Case', onClick: () => { setEditingCase(null); setIsFormOpen(true); } }
              : undefined
          }
        />
      ) : (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800/60">
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Case ID
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Building / Project
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Loan / Lender
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Case Type
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Current Stage
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Assigned To
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-6 py-3.5 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {cases.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 text-sm font-mono font-bold text-indigo-400">
                      <Link href={`/cases/${c.id}`} className="hover:underline">
                        {c.case_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-200">
                      {c.customer ? (
                        <Link
                          href={`/customers/${c.customer.id}`}
                          className="hover:text-indigo-400 transition-colors font-medium"
                        >
                          {c.customer.full_name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-300">
                      {c.building ? (
                        <span className="flex items-center gap-1.5 text-indigo-300">
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                          {c.building.name}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {c.loan_amount ? (
                        <div>
                          <span className="font-mono font-bold text-emerald-400">
                            {formatINR(c.loan_amount)}
                          </span>
                          {c.bank_name && (
                            <span className="block text-[11px] text-slate-400 truncate max-w-[130px]" title={c.bank_name}>
                              {c.bank_name}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{capitalize(c.case_type)}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusColor(
                          c.status
                        )}`}
                      >
                        {capitalize(c.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getPriorityColor(
                          c.priority
                        )}`}
                      >
                        {capitalize(c.priority)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {c.current_stage ? (
                        <span
                          className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
                          style={{
                            backgroundColor: `${c.current_stage.color}20`,
                            color: c.current_stage.color,
                          }}
                        >
                          {c.current_stage.name}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {c.assigned_profile?.full_name ?? 'Unassigned'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{formatDate(c.updated_at)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/cases/${c.id}`}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => {
                            setEditingCase(c);
                            setIsFormOpen(true);
                          }}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeletingCase(c)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-800/60 px-6 py-3">
              <p className="text-sm text-slate-500">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of{' '}
                {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-slate-400">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Case Form Modal */}
      <CaseForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingCase(null);
        }}
        onSuccess={fetchCases}
        caseData={editingCase}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingCase}
        onClose={() => setDeletingCase(null)}
        onConfirm={handleDelete}
        title="Delete Case"
        message={`Are you sure you want to delete case "${deletingCase?.case_number}"? This action cannot be undone.`}
        confirmText="Delete"
        isLoading={isDeleting}
      />
    </div>
  );
}
