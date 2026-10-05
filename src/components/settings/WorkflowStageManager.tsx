'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type { WorkflowStage, Profile, Role } from '@/types';
import {
  GitCommit,
  Plus,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  Clock,
  User,
  Shield,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export default function WorkflowStageManager() {
  const supabase = createClient();
  const { toast } = useToast();

  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<WorkflowStage | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [slaDays, setSlaDays] = useState(3);
  const [requiredTaskTitle, setRequiredTaskTitle] = useState('');
  const [defaultEmployeeId, setDefaultEmployeeId] = useState<string>('');
  const [responsibleRoleId, setResponsibleRoleId] = useState<string>('');
  const [isActive, setIsActive] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [stagesRes, employeesRes, rolesRes] = await Promise.all([
        supabase.from('workflow_stages').select('*').order('display_order', { ascending: true }),
        supabase.from('profiles').select('*').eq('is_active', true),
        supabase.from('roles').select('*'),
      ]);

      setStages((stagesRes.data ?? []) as WorkflowStage[]);
      setEmployees((employeesRes.data ?? []) as Profile[]);
      setRoles((rolesRes.data ?? []) as Role[]);
    } catch {
      toast('Failed to load workflow configuration', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenAddModal = () => {
    setEditingStage(null);
    setName('');
    setDescription('');
    setColor('#6366f1');
    setSlaDays(3);
    setRequiredTaskTitle('');
    setDefaultEmployeeId('');
    setResponsibleRoleId('');
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (stage: WorkflowStage) => {
    setEditingStage(stage);
    setName(stage.name);
    setDescription(stage.description || '');
    setColor(stage.color || '#6366f1');
    setSlaDays(stage.sla_days || 3);
    setRequiredTaskTitle(stage.required_task_title || '');
    setDefaultEmployeeId(stage.default_assigned_employee_id || '');
    setResponsibleRoleId(stage.responsible_role_id || '');
    setIsActive(stage.is_active);
    setIsModalOpen(true);
  };

  const handleSaveStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast('Stage name is required', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        color,
        sla_days: Number(slaDays),
        required_task_title: requiredTaskTitle.trim() || null,
        default_assigned_employee_id: defaultEmployeeId || null,
        responsible_role_id: responsibleRoleId || null,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      if (editingStage) {
        const { error } = await supabase
          .from('workflow_stages')
          .update(payload)
          .eq('id', editingStage.id);

        if (error) throw error;
        toast('Workflow stage updated successfully', 'success');
      } else {
        const maxOrder = stages.reduce((max, s) => Math.max(max, s.display_order), 0);
        const { error } = await supabase.from('workflow_stages').insert({
          ...payload,
          display_order: maxOrder + 1,
        });

        if (error) throw error;
        toast('New workflow stage created', 'success');
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save stage';
      toast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= stages.length) return;

    const newStages = [...stages];
    const current = newStages[index];
    const target = newStages[targetIndex];

    // Swap display_order
    const tempOrder = current.display_order;
    current.display_order = target.display_order;
    target.display_order = tempOrder;

    setStages([...newStages].sort((a, b) => a.display_order - b.display_order));

    try {
      await Promise.all([
        supabase.from('workflow_stages').update({ display_order: current.display_order }).eq('id', current.id),
        supabase.from('workflow_stages').update({ display_order: target.display_order }).eq('id', target.id),
      ]);
      toast('Stage order updated', 'success');
    } catch {
      toast('Failed to save stage order', 'error');
      fetchData();
    }
  };

  const handleToggleActive = async (stage: WorkflowStage) => {
    try {
      const { error } = await supabase
        .from('workflow_stages')
        .update({ is_active: !stage.is_active })
        .eq('id', stage.id);

      if (error) throw error;
      toast(`Stage "${stage.name}" ${!stage.is_active ? 'activated' : 'deactivated'}`, 'success');
      fetchData();
    } catch {
      toast('Failed to update stage status', 'error');
    }
  };

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/60 pb-4">
        <div>
          <div className="flex items-center gap-2 text-slate-100 font-semibold text-lg">
            <GitCommit className="h-5 w-5 text-indigo-400" />
            Workflow Stages Configuration
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Define, reorder, and assign default SLAs & rules for every case stage.
          </p>
        </div>
        <Button onClick={handleOpenAddModal}>
          <Plus className="h-4 w-4" />
          Add Stage
        </Button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-slate-500 text-sm">Loading workflow stages...</div>
      ) : stages.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-sm">No workflow stages configured yet.</div>
      ) : (
        <div className="space-y-3">
          {stages.map((stage, idx) => {
            const defaultEmp = employees.find((e) => e.id === stage.default_assigned_employee_id);
            const respRole = roles.find((r) => r.id === stage.responsible_role_id);

            return (
              <div
                key={stage.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all ${
                  stage.is_active
                    ? 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    : 'border-slate-800/40 bg-slate-950/40 opacity-60'
                }`}
              >
                <div className="flex items-start gap-4 flex-1">
                  <div className="flex flex-col items-center justify-center gap-1 pt-1">
                    <button
                      onClick={() => handleMoveOrder(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1 rounded text-slate-400 hover:text-indigo-400 hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-xs font-mono font-bold text-slate-500">#{stage.display_order}</span>
                    <button
                      onClick={() => handleMoveOrder(idx, 'down')}
                      disabled={idx === stages.length - 1}
                      className="p-1 rounded text-slate-400 hover:text-indigo-400 hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: stage.color || '#6366f1' }}
                      />
                      <h4 className="text-base font-semibold text-slate-100">{stage.name}</h4>
                      <Badge variant={stage.is_active ? 'success' : 'default'}>
                        {stage.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    {stage.description && (
                      <p className="text-xs text-slate-400">{stage.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-2">
                      <div className="flex items-center gap-1 text-indigo-400 font-medium">
                        <Clock className="h-3.5 w-3.5" />
                        <span>SLA: {stage.sla_days} days</span>
                      </div>

                      {defaultEmp && (
                        <div className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5 text-slate-500" />
                          <span>Default: {defaultEmp.full_name}</span>
                        </div>
                      )}

                      {respRole && (
                        <div className="flex items-center gap-1">
                          <Shield className="h-3.5 w-3.5 text-slate-500" />
                          <span>Role: {respRole.name}</span>
                        </div>
                      )}

                      {stage.required_task_title && (
                        <div className="text-slate-500">
                          Auto-task: <span className="text-slate-300">"{stage.required_task_title}"</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 sm:mt-0 justify-end">
                  <button
                    onClick={() => handleToggleActive(stage)}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    {stage.is_active ? (
                      <>
                        <XCircle className="h-4 w-4 text-red-400" />
                        <span>Disable</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span>Enable</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleOpenEditModal(stage)}
                    className="p-2 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Edit Stage"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stage Editor Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStage ? `Edit Stage: ${editingStage.name}` : 'New Workflow Stage'}
      >
        <form onSubmit={handleSaveStage} className="space-y-4">
          <Input
            label="Stage Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Calculation, Document Verification"
            required
          />

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what occurs during this stage..."
              rows={2}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="SLA Target (Days)"
              type="number"
              min={1}
              max={90}
              value={slaDays}
              onChange={(e) => setSlaDays(Number(e.target.value))}
              required
            />

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Stage Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-14 rounded border border-slate-800 bg-slate-900 cursor-pointer p-1"
                />
                <span className="text-sm font-mono text-slate-300">{color}</span>
              </div>
            </div>
          </div>

          <Input
            label="Automated Task Title"
            value={requiredTaskTitle}
            onChange={(e) => setRequiredTaskTitle(e.target.value)}
            placeholder="e.g. Verify Customer ID Documents"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Default Assigned Employee</label>
              <select
                value={defaultEmployeeId}
                onChange={(e) => setDefaultEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="">No default (keep current)</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Responsible Role</label>
              <select
                value={responsibleRoleId}
                onChange={(e) => setResponsibleRoleId(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="">Any Role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActiveStage"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-slate-800 bg-slate-900 text-indigo-500 focus:ring-indigo-500/40"
            />
            <label htmlFor="isActiveStage" className="text-sm text-slate-300 cursor-pointer">
              Active Stage (visible in workflow dropdowns)
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSaving}>
              Save Stage
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
