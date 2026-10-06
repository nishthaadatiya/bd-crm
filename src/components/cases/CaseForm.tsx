'use client';

import { getCaseStatusOptions, normalizeCaseStatus } from '@/lib/case-status';

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
import { formatINR } from '@/lib/utils';
import type { CaseFormData, Case, Customer, Profile, WorkflowStage, Building } from '@/types';
import {
  User,
  Building2,
  Banknote,
  Calendar,
  UserPlus,
  PlusCircle,
  FileCheck2,
} from 'lucide-react';

interface CaseFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  caseData?: Case | null;
  preselectedCustomerId?: string;
}

const COMMON_BANKS = [
  'HDFC Bank',
  'State Bank of India (SBI)',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Bank of Baroda',
  'Punjab National Bank',
  'Bajaj Finserv',
  'Tata Capital',
  'LIC Housing Finance',
  'Piramal Finance',
  'Other / Direct Lender',
];

const LOAN_TYPES = [
  { value: 'Home Loan', label: 'Home Loan' },
  { value: 'Loan Against Property (LAP)', label: 'Loan Against Property (LAP)' },
  { value: 'Construction Loan', label: 'Construction Loan' },
  { value: 'Balance Transfer', label: 'Balance Transfer' },
  { value: 'Plot Purchase Loan', label: 'Plot Purchase Loan' },
  { value: 'Commercial Property Loan', label: 'Commercial Property Loan' },
  { value: 'Personal Loan', label: 'Personal Loan' },
  { value: 'Business Loan', label: 'Business Loan' },
];

export default function CaseForm({
  isOpen,
  onClose,
  onSuccess,
  caseData,
  preselectedCustomerId,
}: CaseFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();
  const isEditing = !!caseData;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);

  // Inline new customer creation state
  const [isNewCustomerMode, setIsNewCustomerMode] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [newCustomerType, setNewCustomerType] = useState<'individual' | 'corporate'>('individual');

  const [formData, setFormData] = useState<CaseFormData>({
    customer_id: caseData?.customer_id ?? preselectedCustomerId ?? '',
    building_id: caseData?.building_id ?? '',
    case_type: caseData?.case_type ?? 'home_loan',
    status: normalizeCaseStatus(caseData?.status ?? 'lead') as CaseFormData['status'],
    priority: caseData?.priority ?? 'medium',
    current_stage_id: caseData?.current_stage_id ?? '',
    assigned_to: caseData?.assigned_to ?? '',
    description: caseData?.description ?? '',
    notes: caseData?.notes ?? '',
    expected_completion_date: caseData?.expected_completion_date ?? '',
    // Loan & financial fields
    loan_amount: caseData?.loan_amount != null ? String(caseData.loan_amount) : '',
    loan_type: caseData?.loan_type ?? 'Home Loan',
    loan_tenure_months: caseData?.loan_tenure_months != null ? String(caseData.loan_tenure_months) : '240',
    interest_rate: caseData?.interest_rate != null ? String(caseData.interest_rate) : '',
    property_value: caseData?.property_value != null ? String(caseData.property_value) : '',
    bank_name: caseData?.bank_name ?? '',
    application_number: caseData?.application_number ?? '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    async function fetchOptions() {
      try {
        const [customersRes, employeesRes, stagesRes, buildingsRes] = await Promise.all([
          supabase.from('customers').select('id, full_name, phone, email').order('full_name'),
          supabase.from('profiles').select('id, full_name, email, role:roles(name)').eq('is_active', true).order('full_name'),
          supabase.from('workflow_stages').select('*').eq('is_active', true).order('display_order'),
          supabase.from('buildings').select('*').order('name'),
        ]);

        const fetchedStages = (stagesRes.data ?? []) as WorkflowStage[];
        setCustomers((customersRes.data ?? []) as Customer[]);
        setEmployees((employeesRes.data ?? []) as unknown as Profile[]);
        setStages(fetchedStages);
        setBuildings((buildingsRes.data ?? []) as Building[]);

        if (!isEditing && fetchedStages.length > 0 && !formData.current_stage_id) {
          setFormData((prev) => ({
            ...prev,
            current_stage_id: fetchedStages[0].id,
            assigned_to: fetchedStages[0].default_assigned_employee_id || prev.assigned_to,
          }));
        }
      } catch (err) {
        console.error('Error fetching form options:', err);
      }
    }

    fetchOptions();
  }, [isOpen, supabase, isEditing, formData.current_stage_id]);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        customer_id: caseData?.customer_id ?? preselectedCustomerId ?? '',
        building_id: caseData?.building_id ?? '',
        case_type: caseData?.case_type ?? 'home_loan',
        status: normalizeCaseStatus(caseData?.status ?? 'lead') as CaseFormData['status'],
        priority: caseData?.priority ?? 'medium',
        current_stage_id: caseData?.current_stage_id ?? '',
        assigned_to: caseData?.assigned_to ?? '',
        description: caseData?.description ?? '',
        notes: caseData?.notes ?? '',
        expected_completion_date: caseData?.expected_completion_date ?? '',
        loan_amount: caseData?.loan_amount != null ? String(caseData.loan_amount) : '',
        loan_type: caseData?.loan_type ?? 'Home Loan',
        loan_tenure_months: caseData?.loan_tenure_months != null ? String(caseData.loan_tenure_months) : '240',
        interest_rate: caseData?.interest_rate != null ? String(caseData.interest_rate) : '',
        property_value: caseData?.property_value != null ? String(caseData.property_value) : '',
        bank_name: caseData?.bank_name ?? '',
        application_number: caseData?.application_number ?? '',
      });
      setIsNewCustomerMode(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerEmail('');
      setNewCustomerAddress('');
      setErrors({});
    }
  }, [isOpen, caseData, preselectedCustomerId]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (isNewCustomerMode) {
      if (!newCustomerName.trim()) {
        newErrors.newCustomerName = 'Customer full name is required';
      }
    } else {
      if (!formData.customer_id) {
        newErrors.customer_id = 'Please select a customer or add a new one';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      let finalCustomerId = formData.customer_id;

      // 1. If in new customer mode, create the customer first inline
      if (isNewCustomerMode) {
        const { data: createdCustomer, error: customerError } = await supabase
          .from('customers')
          .insert({
            full_name: newCustomerName.trim(),
            phone: newCustomerPhone.trim() || null,
            email: newCustomerEmail.trim() || null,
            address: newCustomerAddress.trim() || null,
            customer_type: newCustomerType,
            created_by: user?.id,
          })
          .select()
          .single();

        if (customerError) throw customerError;
        finalCustomerId = createdCustomer.id;

        // Log customer creation
        await supabase.from('activities').insert({
          customer_id: finalCustomerId,
          user_id: user?.id,
          action: 'customer_created',
          description: `Created customer "${newCustomerName.trim()}" inline during case creation`,
        });
      }

      const selectedStage = stages.find((s) => s.status_code === formData.status) || stages.find((s) => s.id === formData.current_stage_id);
      const slaDays = selectedStage?.sla_days || 3;
      const now = new Date();
      const stageDueDate = new Date(now.getTime() + slaDays * 24 * 60 * 60 * 1000).toISOString();

      const finalAssignedTo = formData.assigned_to || selectedStage?.default_assigned_employee_id || user?.id || null;
      // Convert numeric fields properly
      const loanAmountNum = formData.loan_amount ? parseFloat(formData.loan_amount) : null;
      const propertyValueNum = formData.property_value ? parseFloat(formData.property_value) : null;
      const interestRateNum = formData.interest_rate ? parseFloat(formData.interest_rate) : null;
      const loanTenureNum = formData.loan_tenure_months ? parseInt(formData.loan_tenure_months, 10) : null;

      const payload = {
        customer_id: finalCustomerId,
        building_id: formData.building_id || null,
        case_type: formData.case_type || 'home_loan',
        status: formData.status,
        priority: formData.priority,
        current_stage_id: selectedStage?.id || null,
        assigned_to: finalAssignedTo,
        description: formData.description.trim() || null,
        notes: formData.notes.trim() || null,
        expected_completion_date: formData.expected_completion_date || null,
        // Loan & Financial Details
        loan_amount: loanAmountNum,
        loan_type: formData.loan_type || null,
        loan_tenure_months: loanTenureNum,
        interest_rate: interestRateNum,
        property_value: propertyValueNum,
        bank_name: formData.bank_name?.trim() || null,
        application_number: formData.application_number?.trim() || null,
      };

      if (isEditing) {
        const details: Partial<typeof payload> = { ...payload };
        delete details.status;
        delete details.assigned_to;
        delete details.current_stage_id;
        const { error } = await supabase.from('cases').update(details).eq('id', caseData.id);

        if (error) throw error;

        await supabase.from('activities').insert({
          case_id: caseData.id,
          customer_id: finalCustomerId,
          user_id: user?.id,
          action: 'case_updated',
          description: `Updated case ${caseData.case_number}`,
        });

        toast('Case updated successfully', 'success');
      } else {
        // Compute CASE-000001 format explicitly to guarantee requirement compliance
        let generatedCaseNumber = '';
        try {
          const { count } = await supabase.from('cases').select('*', { count: 'exact', head: true });
          const nextCount = (count || 0) + 1;
          generatedCaseNumber = `CASE-${String(nextCount).padStart(6, '0')}`;
        } catch {
          // Fallback to trigger
        }

        const { data, error } = await supabase
          .from('cases')
          .insert({
            ...payload,
            case_number: generatedCaseNumber || '',
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
          customer_id: finalCustomerId,
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

          // Create initial configured task(s)
          const taskTitles = selectedStage.required_task_title
            ? selectedStage.required_task_title
                .split('\n')
                .map((t) => t.trim())
                .filter(Boolean)
            : [`Initial task for ${selectedStage.name}`];

          const createdTasks: { id: string; title: string }[] = [];
          for (const title of taskTitles) {
            const { data: initialTask } = await supabase
              .from('tasks')
              .insert({
                case_id: data.id,
                stage_id: selectedStage.id,
                title,
                description: `Automated stage task for ${selectedStage.name}`,
                status: 'pending',
                priority: formData.priority || 'medium',
                assigned_to: finalAssignedTo,
                due_date: stageDueDate.split('T')[0],
                created_by: user?.id,
              })
              .select('id, title')
              .single();

            if (initialTask) createdTasks.push(initialTask);
          }

          // Notify assigned employee
          if (finalAssignedTo && finalAssignedTo !== user?.id) {
            const taskSummary =
              createdTasks.length === 1
                ? `Initial task: "${createdTasks[0].title}"`
                : `${createdTasks.length} initial tasks assigned for ${selectedStage.name}`;

            await sendNotification(
              supabase,
              finalAssignedTo,
              `New case assigned: ${data.case_number}`,
              `You have been assigned to case ${data.case_number}. ${taskSummary}`,
              'info',
              `/cases/${data.id}`,
              data.id,
              createdTasks[0]?.id
            );
          }
        }

        toast('Case created successfully', 'success');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      const message =
        error?.message ||
        error?.error_description ||
        (error instanceof Error ? error.message : 'Failed to save case');
      console.error('Case save error:', error);
      toast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof CaseFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Case' : 'Create New Case'}
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION 1: CUSTOMER (With Inline Creation) */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <User className="h-4 w-4 text-indigo-400" />
              1. Customer Information *
            </label>
            {!isEditing && !preselectedCustomerId && (
              <button
                type="button"
                onClick={() => {
                  setIsNewCustomerMode(!isNewCustomerMode);
                  setErrors({});
                }}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition-colors"
              >
                {isNewCustomerMode ? (
                  '← Select Existing Customer'
                ) : (
                  <>
                    <PlusCircle className="h-3.5 w-3.5" />
                    + New Customer Inline
                  </>
                )}
              </button>
            )}
          </div>

          {!isNewCustomerMode ? (
            <div>
              <Select
                id="customer_id"
                label="Select Customer"
                value={formData.customer_id}
                onChange={(e) => updateField('customer_id', e.target.value)}
                error={errors.customer_id}
                placeholder="Choose from existing customers"
                options={customers.map((c) => ({
                  value: c.id,
                  label: `${c.full_name} ${c.phone ? `(${c.phone})` : ''}`,
                }))}
                disabled={!!preselectedCustomerId || isEditing}
              />
            </div>
          ) : (
            <div className="space-y-3 pt-1 border-t border-slate-800/80">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  id="newCustomerName"
                  label="Customer Full Name *"
                  placeholder="e.g. Ramesh Sharma"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  error={errors.newCustomerName}
                  autoFocus
                />
                <Input
                  id="newCustomerPhone"
                  label="Phone Number"
                  placeholder="e.g. +91 98765 43210"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  id="newCustomerEmail"
                  label="Email Address"
                  type="email"
                  placeholder="e.g. ramesh@example.com"
                  value={newCustomerEmail}
                  onChange={(e) => setNewCustomerEmail(e.target.value)}
                />
                <Input
                  id="newCustomerAddress"
                  label="City / Address"
                  placeholder="e.g. Indiranagar, Bangalore"
                  value={newCustomerAddress}
                  onChange={(e) => setNewCustomerAddress(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: PROJECT & CASE TYPE */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-indigo-400" />
            2. Project & Case Category
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              id="building_id"
              label="Building / Project"
              value={formData.building_id}
              onChange={(e) => updateField('building_id', e.target.value)}
              placeholder="Select project (database driven)"
              options={buildings.map((b) => ({
                value: b.id,
                label: b.code ? `${b.name} (${b.code})` : b.name,
              }))}
            />

            <Select
              id="case_type"
              label="Case Type"
              value={formData.case_type}
              onChange={(e) => updateField('case_type', e.target.value)}
              options={[
                { value: 'home_loan', label: 'Home Loan Application' },
                { value: 'mortgage_loan', label: 'Mortgage / LAP' },
                { value: 'commercial_loan', label: 'Commercial Loan' },
                { value: 'balance_transfer', label: 'Balance Transfer' },
                { value: 'general_service', label: 'General / Consultation' },
              ]}
            />
          </div>
        </div>

        {/* SECTION 3: LOAN & FINANCIAL DETAILS */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Banknote className="h-4 w-4 text-emerald-400" />
              3. Loan & Financial Details (INR ₹)
            </label>
            {formData.loan_amount && (
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Loan: {formatINR(formData.loan_amount)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                id="loan_amount"
                label="Loan Amount (₹)"
                type="number"
                placeholder="e.g. 5000000"
                value={formData.loan_amount}
                onChange={(e) => updateField('loan_amount', e.target.value)}
              />
              {formData.loan_amount && (
                <p className="mt-1 text-[11px] text-emerald-400 font-mono">
                  = {formatINR(formData.loan_amount)}
                </p>
              )}
            </div>

            <div>
              <Input
                id="property_value"
                label="Property / Asset Value (₹)"
                type="number"
                placeholder="e.g. 7500000"
                value={formData.property_value}
                onChange={(e) => updateField('property_value', e.target.value)}
              />
              {formData.property_value && (
                <p className="mt-1 text-[11px] text-slate-400 font-mono">
                  = {formatINR(formData.property_value)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              id="loan_type"
              label="Loan Product"
              value={formData.loan_type || 'Home Loan'}
              onChange={(e) => updateField('loan_type', e.target.value)}
              options={LOAN_TYPES}
            />

            <div>
              <label htmlFor="bank_name" className="block text-xs font-medium text-slate-300 mb-1">
                Bank / Lender
              </label>
              <input
                id="bank_name"
                list="bank-options"
                type="text"
                placeholder="e.g. HDFC Bank, SBI"
                value={formData.bank_name}
                onChange={(e) => updateField('bank_name', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <datalist id="bank-options">
                {COMMON_BANKS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Input
                id="interest_rate"
                label="Interest Rate (% p.a.)"
                type="number"
                step="0.01"
                placeholder="e.g. 8.50"
                value={formData.interest_rate}
                onChange={(e) => updateField('interest_rate', e.target.value)}
              />
            </div>

            <div>
              <Input
                id="loan_tenure_months"
                label="Tenure (Months)"
                type="number"
                placeholder="e.g. 240 (20 yrs)"
                value={formData.loan_tenure_months}
                onChange={(e) => updateField('loan_tenure_months', e.target.value)}
              />
              {formData.loan_tenure_months && (
                <p className="mt-1 text-[11px] text-slate-400">
                  ≈ {(parseInt(formData.loan_tenure_months, 10) / 12).toFixed(1)} years
                </p>
              )}
            </div>

            <div>
              <Input
                id="application_number"
                label="Bank Application / Ref #"
                placeholder="e.g. HDFC-2026-991"
                value={formData.application_number}
                onChange={(e) => updateField('application_number', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* SECTION 4: WORKFLOW STAGE & ASSIGNMENT */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <FileCheck2 className="h-4 w-4 text-indigo-400" />
            4. Workflow & Operations Assignment
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              id="current_stage_id" disabled
              label="Workflow stage (use Complete & Handoff to change)"
              value={formData.current_stage_id}
              onChange={(e) => updateField('current_stage_id', e.target.value)}
              placeholder="Select starting stage"
              options={stages.map((s) => ({ value: s.id, label: `${s.display_order}. ${s.name}` }))}
            />

            <Select
              id="assigned_to" disabled={isEditing}
              label="Responsible Employee *"
              value={formData.assigned_to}
              onChange={(e) => updateField('assigned_to', e.target.value)}
              placeholder="Choose assigned operational employee"
              options={employees.map((e) => ({
                value: e.id,
                label: `${e.full_name} (${(e as any).role?.name || 'Staff'})`,
              }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              id="priority"
              label="Priority"
              value={formData.priority}
              onChange={(e) => updateField('priority', e.target.value)}
              options={[
                { value: 'low', label: 'Low Priority' },
                { value: 'medium', label: 'Medium Priority' },
                { value: 'high', label: 'High Priority' },
                { value: 'urgent', label: 'Urgent Priority' },
              ]}
            />

            <Select
              id="status" disabled
              label="Status"
              value={formData.status}
              onChange={(e) => updateField('status', e.target.value)}
              options={getCaseStatusOptions(caseData?.status)}
            />

            <Input
              id="expected_completion_date"
              label="Target Completion Date"
              type="date"
              value={formData.expected_completion_date}
              onChange={(e) => updateField('expected_completion_date', e.target.value)}
            />
          </div>

          <Textarea
            id="notes"
            label="Internal Notes / Loan Instructions"
            value={formData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Key client requirements, eligibility notes, special instructions..."
            rows={2}
          />
        </div>

        {/* MODAL ACTIONS */}
        <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            {isEditing ? 'Save Changes' : 'Create Complete Case'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
