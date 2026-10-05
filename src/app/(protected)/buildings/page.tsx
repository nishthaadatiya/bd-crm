'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/Skeleton';
import BuildingForm from '@/components/buildings/BuildingForm';
import { formatDate } from '@/lib/utils';
import type { Building } from '@/types';
import {
  Building2,
  Plus,
  Search,
  Pencil,
  Trash2,
  Power,
  MapPin,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
} from 'lucide-react';

interface BuildingWithCount extends Building {
  cases_count?: number;
}

export default function BuildingsPage() {
  const supabase = createClient();
  const { role } = useAuth();
  const { toast } = useToast();
  const isOwnerOrManager = role === 'owner' || role === 'manager';

  const [buildings, setBuildings] = useState<BuildingWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [deletingBuilding, setDeletingBuilding] = useState<Building | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchBuildings = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('buildings')
        .select(`*, cases(count)`)
        .order('name', { ascending: true });

      if (statusFilter === 'active') {
        query = query.eq('is_active', true);
      } else if (statusFilter === 'inactive') {
        query = query.eq('is_active', false);
      }

      const { data, error } = await query;

      if (error) {
        // Table might not exist yet if migration hasn't run
        if (error.code === 'PGRST205' || error.message.includes('does not exist')) {
          setBuildings([]);
          return;
        }
        throw error;
      }

      const mapped = (data ?? []).map((b) => ({
        ...b,
        cases_count: Array.isArray(b.cases) && b.cases.length > 0 ? (b.cases[0] as { count: number }).count : 0,
      }));

      setBuildings(mapped);
    } catch (error) {
      console.error('Error fetching buildings:', error);
      toast('Failed to load buildings', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, statusFilter, toast]);

  useEffect(() => {
    fetchBuildings();
  }, [fetchBuildings]);

  const handleToggleActive = async (bld: Building) => {
    try {
      const { error } = await supabase
        .from('buildings')
        .update({ is_active: !bld.is_active, updated_at: new Date().toISOString() })
        .eq('id', bld.id);

      if (error) throw error;
      toast(`Building ${!bld.is_active ? 'activated' : 'deactivated'} successfully`, 'success');
      fetchBuildings();
    } catch {
      toast('Failed to update status', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deletingBuilding) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('buildings').delete().eq('id', deletingBuilding.id);
      if (error) throw error;
      toast('Building deleted successfully', 'success');
      setDeletingBuilding(null);
      fetchBuildings();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to delete building';
      toast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredBuildings = buildings.filter((b) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      (b.code && b.code.toLowerCase().includes(q)) ||
      (b.address && b.address.toLowerCase().includes(q))
    );
  });

  const totalActive = buildings.filter((b) => b.is_active).length;
  const totalInactive = buildings.filter((b) => !b.is_active).length;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="h-6 w-6 text-indigo-400" />
            Buildings & Projects
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Organize customer cases by building, site, or project development
          </p>
        </div>

        {isOwnerOrManager && (
          <Button
            onClick={() => {
              setEditingBuilding(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New Building / Project
          </Button>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Total Projects</p>
            <p className="text-2xl font-bold text-white mt-1">{buildings.length}</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <Building2 className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Active</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{totalActive}</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <CheckCircle className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Inactive / Archived</p>
            <p className="text-2xl font-bold text-slate-400 mt-1">{totalInactive}</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
            <XCircle className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by building name, reference code, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
          <TableSkeleton rows={5} cols={6} />
        </div>
      ) : filteredBuildings.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8 text-slate-500" />}
          title={search ? 'No matching buildings found' : 'No buildings registered'}
          description={
            search
              ? 'Try adjusting your search criteria'
              : 'Add your first building or project to begin grouping customer cases'
          }
          action={
            isOwnerOrManager && !search
              ? {
                  label: 'Add Building',
                  onClick: () => {
                    setEditingBuilding(null);
                    setIsFormOpen(true);
                  },
                }
              : undefined
          }
        />
      ) : (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800/60 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3.5 text-left">Building / Project</th>
                  <th className="px-6 py-3.5 text-left">Code</th>
                  <th className="px-6 py-3.5 text-left">Location</th>
                  <th className="px-6 py-3.5 text-left">Cases</th>
                  <th className="px-6 py-3.5 text-left">Status</th>
                  <th className="px-6 py-3.5 text-left">Added</th>
                  {isOwnerOrManager && <th className="px-6 py-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-sm">
                {filteredBuildings.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-white">{b.name}</p>
                        {b.description && (
                          <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{b.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-indigo-400 font-semibold">
                      {b.code || '—'}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-300">
                      {b.address ? (
                        <span className="flex items-center gap-1.5 truncate max-w-xs">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                          {b.address}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-300">
                      {b.cases_count ?? 0}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={b.is_active ? 'success' : 'default'}>
                        {b.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {formatDate(b.created_at)}
                    </td>
                    {isOwnerOrManager && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleToggleActive(b)}
                            title={b.is_active ? 'Deactivate building' : 'Activate building'}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              b.is_active
                                ? 'text-amber-400 hover:bg-amber-500/10'
                                : 'text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                          >
                            <Power className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingBuilding(b);
                              setIsFormOpen(true);
                            }}
                            title="Edit building details"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeletingBuilding(b)}
                            title="Delete building"
                            className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Building Create / Edit Modal */}
      <BuildingForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingBuilding(null);
        }}
        onSuccess={fetchBuildings}
        building={editingBuilding}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingBuilding}
        onClose={() => setDeletingBuilding(null)}
        onConfirm={handleDelete}
        title="Delete Building"
        message={`Are you sure you want to delete "${deletingBuilding?.name}"? Cases associated with this building will retain their records, but will no longer be linked to this building.`}
        confirmText="Delete"
        isLoading={isDeleting}
      />
    </div>
  );
}
