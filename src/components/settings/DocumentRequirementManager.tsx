'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/Skeleton';
import type { WorkflowStage, DocumentRequirement } from '@/types';
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  FileCheck,
  AlertCircle,
  Layers,
} from 'lucide-react';

export default function DocumentRequirementManager() {
  const supabase = createClient();
  const { toast } = useToast();

  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const [requirements, setRequirements] = useState<DocumentRequirement[]>([]);
  const [isLoadingStages, setIsLoadingStages] = useState(true);
  const [isLoadingReqs, setIsLoadingReqs] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<DocumentRequirement | null>(null);
  const [deletingReq, setDeletingReq] = useState<DocumentRequirement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isMandatory, setIsMandatory] = useState(true);
  const [displayOrder, setDisplayOrder] = useState(1);

  // Fetch Workflow Stages
  useEffect(() => {
    async function loadStages() {
      setIsLoadingStages(true);
      try {
        const { data, error } = await supabase
          .from('workflow_stages')
          .select('*')
          .eq('is_active', true)
          .order('display_order', { ascending: true });

        if (error) throw error;
        const stagesList = (data ?? []) as WorkflowStage[];
        setStages(stagesList);

        if (stagesList.length > 0) {
          // Default to Document Collection stage if available
          const docStage = stagesList.find((s) =>
            s.name.toLowerCase().includes('document') || s.name.toLowerCase().includes('collection')
          );
          setSelectedStageId(docStage ? docStage.id : stagesList[0].id);
        }
      } catch {
        toast('Failed to load workflow stages', 'error');
      } finally {
        setIsLoadingStages(false);
      }
    }
    loadStages();
  }, [supabase, toast]);

  // Fetch Requirements for Selected Stage
  const fetchRequirements = useCallback(async () => {
    if (!selectedStageId) return;
    setIsLoadingReqs(true);
    try {
      const { data, error } = await supabase
        .from('document_requirements')
        .select('*')
        .eq('stage_id', selectedStageId)
        .order('display_order', { ascending: true });

      if (error) {
        if (error.code === 'PGRST205' || error.message.includes('does not exist')) {
          setRequirements([]);
          return;
        }
        throw error;
      }
      setRequirements((data ?? []) as DocumentRequirement[]);
    } catch {
      toast('Failed to load document requirements', 'error');
    } finally {
      setIsLoadingReqs(false);
    }
  }, [supabase, selectedStageId, toast]);

  useEffect(() => {
    fetchRequirements();
  }, [fetchRequirements]);

  const handleOpenCreateModal = () => {
    setEditingReq(null);
    setName('');
    setDescription('');
    setIsMandatory(true);
    setDisplayOrder(requirements.length + 1);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (req: DocumentRequirement) => {
    setEditingReq(req);
    setName(req.name);
    setDescription(req.description || '');
    setIsMandatory(req.is_mandatory);
    setDisplayOrder(req.display_order);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast('Document name is required', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        stage_id: selectedStageId,
        name: name.trim(),
        description: description.trim() || null,
        is_mandatory: isMandatory,
        display_order: displayOrder,
        is_active: true,
      };

      if (editingReq) {
        const { error } = await supabase
          .from('document_requirements')
          .update(payload)
          .eq('id', editingReq.id);
        if (error) throw error;
        toast('Document requirement updated', 'success');
      } else {
        const { error } = await supabase
          .from('document_requirements')
          .insert(payload);
        if (error) throw error;
        toast('Document requirement added', 'success');
      }

      setIsModalOpen(false);
      fetchRequirements();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save requirement';
      toast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingReq) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('document_requirements')
        .delete()
        .eq('id', deletingReq.id);

      if (error) throw error;
      toast('Document requirement removed', 'success');
      setDeletingReq(null);
      fetchRequirements();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete requirement';
      toast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleMandatory = async (req: DocumentRequirement) => {
    try {
      const { error } = await supabase
        .from('document_requirements')
        .update({ is_mandatory: !req.is_mandatory, updated_at: new Date().toISOString() })
        .eq('id', req.id);

      if (error) throw error;
      toast(`Marked as ${!req.is_mandatory ? 'mandatory' : 'optional'}`, 'success');
      fetchRequirements();
    } catch {
      toast('Failed to update requirement', 'error');
    }
  };

  const currentStage = stages.find((s) => s.id === selectedStageId);

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/60 pb-4">
        <div>
          <div className="flex items-center gap-2 text-slate-200 font-semibold">
            <FileCheck className="h-5 w-5 text-indigo-400" />
            Configurable Stage Document Requirements
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Configure required checklist documents for each stage of your workflow (PAN, Aadhaar, Bank Statement, etc.)
          </p>
        </div>

        <Button size="sm" onClick={handleOpenCreateModal} disabled={!selectedStageId}>
          <Plus className="h-4 w-4" />
          Add Document Requirement
        </Button>
      </div>

      {/* Stage Selector Pills */}
      {isLoadingStages ? (
        <div className="h-10 w-full animate-pulse bg-slate-800 rounded-lg" />
      ) : (
        <div className="flex flex-wrap gap-2">
          {stages.map((stg) => {
            const isSelected = stg.id === selectedStageId;
            return (
              <button
                key={stg.id}
                type="button"
                onClick={() => setSelectedStageId(stg.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: stg.color || '#6366f1' }}
                />
                {stg.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Requirements List */}
      {isLoadingReqs ? (
        <TableSkeleton rows={4} cols={5} />
      ) : requirements.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center space-y-3">
          <FileText className="h-8 w-8 text-slate-600 mx-auto" />
          <p className="text-sm font-medium text-slate-300">
            No document requirements configured for &ldquo;{currentStage?.name || 'this stage'}&rdquo;
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Add documents like PAN, Aadhaar, salary slips, or property papers that employees must collect or verify.
          </p>
          <Button size="sm" variant="secondary" onClick={handleOpenCreateModal}>
            <Plus className="h-3.5 w-3.5" />
            Add First Requirement
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Document Name</th>
                <th className="px-4 py-3">Description / Guide</th>
                <th className="px-4 py-3">Requirement</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {requirements.map((req) => (
                <tr key={req.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    #{req.display_order}
                  </td>
                  <td className="px-4 py-3 font-medium text-white">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-indigo-400 shrink-0" />
                      {req.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 max-w-xs truncate">
                    {req.description || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleMandatory(req)}
                      className="cursor-pointer"
                      title="Click to toggle mandatory / optional"
                    >
                      <Badge variant={req.is_mandatory ? 'warning' : 'default'}>
                        {req.is_mandatory ? 'Mandatory' : 'Optional'}
                      </Badge>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleOpenEditModal(req)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Edit requirement"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingReq(req)}
                        className="p-1.5 rounded text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete requirement"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Requirement Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingReq ? 'Edit Document Requirement' : `Add Requirement: ${currentStage?.name}`}
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            id="req_name"
            label="Document Name *"
            placeholder="e.g. PAN Card, Aadhaar Card, 6 Months Bank Statement"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          <Textarea
            id="req_desc"
            label="Instructions / Guidelines"
            placeholder="e.g. Both front and back side, clear scan in PDF or JPG format"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              id="req_order"
              label="Display Order"
              type="number"
              value={displayOrder.toString()}
              onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 1)}
            />

            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="is_mandatory"
                checked={isMandatory}
                onChange={(e) => setIsMandatory(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="is_mandatory" className="text-sm font-medium text-slate-300">
                Mandatory for stage
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSaving}>
              {editingReq ? 'Update Requirement' : 'Save Requirement'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingReq}
        onClose={() => setDeletingReq(null)}
        onConfirm={handleDelete}
        title="Delete Requirement"
        message={`Are you sure you want to remove the requirement "${deletingReq?.name}" from stage "${currentStage?.name}"?`}
        confirmText="Remove"
        isLoading={isDeleting}
      />
    </div>
  );
}
