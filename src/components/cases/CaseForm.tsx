'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import { sendNotification } from '@/lib/workflow';
import type { CaseFormData, Case, Customer, Profile, WorkflowStage, Building } from '@/types';

interface CaseFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  caseData?: Case | null;
  preselectedCustomerId?: string;
}

export default function CaseForm({
  isOpen,
  onClose,
  onSuccess,
  caseData,
  preselectedCustomerId,
}: CaseFormProps) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();
  const isEditing = !!caseData;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);

  const [formData, setFormData] = useState<CaseFormData>({
    customer_id: caseData?.customer_id ?? preselectedCustomerId ?? '',
    building_id: caseData?.building_id ?? '',
    case_type: caseData?.case_type ?? 'general',
    status: caseData?.status ?? 'new',
    priority: caseData?.priority ?? 'medium',
    current_stage_id: caseData?.current_stage_id ?? '',
    assigned_to: caseData?.assigned_to ?? '',
    description: caseData?.description ?? '',
    notes: caseData?.notes ?? '',
    expected_completion_date: caseData?.expected_completion_date ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CaseFormData, string>>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    async function fetchOptions() {
      try {
        const [customersRes, employeesRes, stagesRes, buildingsRes] = await Promise.all([
          supabase.from('customers').select('id, full_name').order('full_name'),
          supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
          supabase.from('workflow_stages').select('*').eq('is_active', true).order('display_order'),
          supabase.from('buildings').select('*').order('name'),
        ]);

        const fetchedStages = (stagesRes.data ?? []) as WorkflowStage[];
        setCustomers((customersRes.data ?? []) as Customer[]);
        setEmployees((employeesRes.data ?? []) as Profile[]);
        setStages(fetchedStages);
        setBuildings((buildingsRes.data ?? []) as Building[]);

        if (!isEditing && fetchedStages.length > 0 && !formData.current_stage_id) {
          setFormData((prev) => ({
            ...prev,
            current_stage_id: fetchedStages[0].id,
            assigned_to: fetchedStages[0].default_assigned_employee_id || prev.assigned_to,
          }));
        }
      } catch {
        // Fallback gracefully if any optional table is not yet created
      }
    }

    fetchOptions();
  }, [isOpen, supabase, isEditing, formData.current_stage_id]);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        customer_id: caseData?.customer_id ?? preselectedCustomerId ?? '',
        building_id: caseData?.building_id ?? '',
        case_type: caseData?.case_type ?? 'general',
        status: caseData?.status ?? 'new',
        priority: caseData?.priority ?? 'medium',
        current_stage_id: caseData?.current_stage_id ?? '',
        assigned_to: caseData?.assigned_to ?? '',
        description: caseData?.description ?? '',
        notes: caseData?.notes ?? '',
        expected_completion_date: caseData?.expected_completion_date ?? '',
      });
      setErrors({});
    }
  }, [isOpen, caseData, preselectedCustomerId]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof CaseFormData, string>> = {};
    if (!formData.customer_id) {
      newErrors.customer_id = 'Customer is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const selectedStage = stages.find((s) => s.id === formData.current_stage_id);
      const slaDays = selectedStage?.sla_days || 3;
      const now = new Date();
      const stageDueDate = new Date(now.getTime() + slaDays * 24 * 60 * 60 * 1000).toISOString();

      // Employees cannot assign cases to others
      let finalAssignedTo: string | null = formData.assigned_to || null;
      if (role === 'employee' && !isEditing) {
        finalAssignedTo = user?.id || null;
      } else if (!finalAssignedTo) {
        finalAssignedTo = selectedStage?.default_assigned_employee_id || user?.id || null;
      }

      const payload = {
        customer_id: formData.customer_id,
        building_id: formData.building_id || null,
        case_type: formData.case_type,
        status: formData.status,
        priority: formData.priority,
        current_stage_id: formData.current_stage_id || null,
        assigned_to: finalAssignedTo,
        description: formData.description.trim() || null,
        notes: formData.notes.trim() || null,
        expected_completion_date: formData.expected_completion_date || null,
      };

      if (isEditing) {
        const { error } = await supabase.from('cases').update(payload).eq('id', caseData.id);

        if (error) throw error;

        await supabase.from('activities').insert({
          case_id: caseData.id,
          customer_id: formData.customer_id,
          user_id: user?.id,
          action: 'case_updated',
          description: `Updated case ${caseData.case_number}`,
        });

        toast('Case updated successfully', 'success');
      } else {
        const { data, error } = await supabase
          .from('cases')
          .insert({
            ...payload,
            case_number: '', // Will be auto-generated by trigger
            stage_entered_at: now.toISOString(),
            stage_due_date: stageDueDate,
            created_by: user?.id,
          })
          .select()
          .single();

        if (error) throw error;

        // Log creation activity
        await supabase.from('activities').insert({
          case_id: data.id,
          customer_id: formData.customer_id,
          user_id: user?.id,
          action: 'case_created',
          description: `Created case ${data.case_number}`,
        });

        // Log initial stage history
        if (selectedStage) {
          await supabase.from('case_stage_history').insert({
            case_id: data.id,
            from_stage_id: null,
            to_stage_id: selectedStage.id,
            changed_by: user?.id,
            assigned_to: finalAssignedTo,
            notes: 'Initial case creation',
          });

          // Create initial task if required task title exists
          const taskTitle =
            selectedStage.required_task_title || `Initial task for ${selectedStage.name}`;
          const { data: initialTask } = await supabase.from('tasks').insert({
            case_id: data.id,
            stage_id: selectedStage.id,
            title: taskTitle,
            description: `Automated stage task for ${selectedStage.name}`,
            status: 'pending',
            priority: formData.priority || 'medium',
            assigned_to: finalAssignedTo,
            due_date: stageDueDate.split('T')[0],
            created_by: user?.id,
          }).select().single();

          // Notify assigned employee
          if (finalAssignedTo && finalAssignedTo !== user?.id) {
            await sendNotification(
              supabase,
              finalAssignedTo,
              `New case assigned: ${data.case_number}`,
              `You have been assigned to case ${data.case_number}. Initial task: "${taskTitle}"`,
              'info',
              `/cases/${data.id}`,
              data.id,
              initialTask?.id
            );
          }
        }

        toast('Case created successfully', 'success');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      const message = error?.message || error?.error_description || (error instanceof Error ? error.message : 'Failed to save case');
      console.error('Case save error:', error);
      toast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof CaseFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Case' : 'Create New Case'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            id="customer_id"
            label="Customer *"
            value={formData.customer_id}
            onChange={(e) => updateField('customer_id', e.target.value)}
            error={errors.customer_id}
            placeholder="Select customer"
            options={customers.map((c) => ({ value: c.id, label: c.full_name }))}
            disabled={!!preselectedCustomerId}
          />
          <Select
            id="building_id"
            label="Building / Project"
            value={formData.building_id}
            onChange={(e) => updateField('building_id', e.target.value)}
            placeholder="Select building / project (optional)"
            options={buildings.map((b) => ({
              value: b.id,
              label: b.code ? `${b.name} (${b.code})` : b.name,
            }))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            id="case_type"
            label="Case Type"
            value={formData.case_type}
            onChange={(e) => updateField('case_type', e.target.value)}
            options={[
              { value: 'general', label: 'General' },
              { value: 'home_loan', label: 'Home Loan' },
              { value: 'mortgage', label: 'Mortgage' },
              { value: 'consultation', label: 'Consultation' },
              { value: 'loan_application', label: 'Loan Application' },
              { value: 'service', label: 'Service' },
              { value: 'complaint', label: 'Complaint' },
              { value: 'follow_up', label: 'Follow Up' },
            ]}
          />
          <Select
            id="current_stage_id"
            label="Workflow Stage"
            value={formData.current_stage_id}
            onChange={(e) => updateField('current_stage_id', e.target.value)}
            placeholder="Select stage"
            options={stages.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            id="status"
            label="Status"
            value={formData.status}
            onChange={(e) => updateField('status', e.target.value)}
            options={[
              { value: 'new', label: 'New' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'waiting', label: 'Waiting' },
              { value: 'blocked', label: 'Blocked' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
          <Select
            id="priority"
            label="Priority"
            value={formData.priority}
            onChange={(e) => updateField('priority', e.target.value)}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            id="assigned_to"
            label={role === 'employee' ? 'Assigned To (Locked)' : 'Assigned To'}
            value={formData.assigned_to}
            onChange={(e) => updateField('assigned_to', e.target.value)}
            placeholder="Select employee"
            options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
            disabled={role === 'employee'}
          />
          <Input
            id="expected_completion_date"
            label="Expected Completion"
            type="date"
            value={formData.expected_completion_date}
            onChange={(e) => updateField('expected_completion_date', e.target.value)}
          />
        </div>

        <Textarea
          id="description"
          label="Description"
          value={formData.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Describe this case"
        />

        <Textarea
          id="notes"
          label="Notes"
          value={formData.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="Additional notes"
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            {isEditing ? 'Save Changes' : 'Create Case'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
