'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { PageSkeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import CustomerForm from '@/components/customers/CustomerForm';
import CaseForm from '@/components/cases/CaseForm';
import { formatDate, formatDateTime, capitalize, getStatusColor, getPriorityColor, formatINR } from '@/lib/utils';
import type { Customer, Case, Activity } from '@/types';
import {
  ArrowLeft,
  Pencil,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Briefcase,
  Plus,
  User,
  FileText,
  Clock,
} from 'lucide-react';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCaseFormOpen, setIsCaseFormOpen] = useState(false);

  const fetchCustomer = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();

      if (error) throw error;
      setCustomer(data);
    } catch {
      toast('Failed to load customer', 'error');
      router.push('/customers');
    }
  }, [supabase, customerId, toast, router]);

  const fetchCases = useCallback(async () => {
    const { data } = await supabase
      .from('cases')
      .select(`
        *,
        building:buildings(*),
        assigned_profile:profiles!cases_assigned_to_fkey(id, full_name),
        current_stage:workflow_stages(id, name, color)
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    setCases((data ?? []) as Case[]);
  }, [supabase, customerId]);

  const fetchActivities = useCallback(async () => {
    const { data } = await supabase
      .from('activities')
      .select(`
        *,
        user:profiles(id, full_name)
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20);

    setActivities((data ?? []) as Activity[]);
  }, [supabase, customerId]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      await Promise.all([fetchCustomer(), fetchCases(), fetchActivities()]);
      setIsLoading(false);
    }
    load();
  }, [fetchCustomer, fetchCases, fetchActivities]);

  if (isLoading) return <PageSkeleton />;
  if (!customer) return null;

  const infoItems = [
    { icon: Phone, label: 'Phone', value: customer.phone },
    { icon: Mail, label: 'Email', value: customer.email },
    { icon: MapPin, label: 'Address', value: customer.address },
    { icon: User, label: 'Type', value: capitalize(customer.customer_type) },
    { icon: Calendar, label: 'Created', value: formatDate(customer.created_at) },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/customers')}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{customer.full_name}</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Customer since {formatDate(customer.created_at)}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setIsFormOpen(true)}>
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer Info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
            <h3 className="text-sm font-medium text-slate-300 mb-4">Customer Information</h3>
            <div className="space-y-4">
              {infoItems.map((item) => (
                <div key={item.label} className="flex items-start gap-3">
                  <item.icon className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <p className="text-sm text-slate-200">{item.value || '—'}</p>
                  </div>
                </div>
              ))}
            </div>
            {customer.notes && (
              <div className="mt-6 pt-4 border-t border-slate-800/60">
                <div className="flex items-start gap-3">
                  <FileText className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Notes</p>
                    <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">{customer.notes}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cases & Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cases */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40">
            <div className="flex items-center justify-between border-b border-slate-800/60 px-6 py-4">
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-slate-400" />
                <h3 className="text-sm font-medium text-slate-200">
                  Cases ({cases.length})
                </h3>
              </div>
              <Button size="sm" onClick={() => setIsCaseFormOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                New Case
              </Button>
            </div>
            {cases.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={<Briefcase className="h-8 w-8 text-slate-500" />}
                  title="No cases yet"
                  description="Create a case to track work for this customer"
                  action={{ label: 'Create Case', onClick: () => setIsCaseFormOpen(true) }}
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-800/40">
                {cases.map((c) => (
                  <Link
                    key={c.id}
                    href={`/cases/${c.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-slate-800/30 transition-colors group"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-indigo-400">{c.case_number}</span>
                        {c.loan_amount && (
                          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            {formatINR(c.loan_amount)}
                          </span>
                        )}
                        {c.building && (
                          <span className="text-xs text-indigo-300 font-medium">
                            · {c.building.name}
                          </span>
                        )}
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusColor(c.status)}`}>
                          {capitalize(c.status)}
                        </span>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getPriorityColor(c.priority)}`}>
                          {capitalize(c.priority)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300 group-hover:text-indigo-400 transition-colors">
                        {c.description || `${c.loan_type || capitalize(c.case_type)} ${c.bank_name ? `• ${c.bank_name}` : ''}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      {c.current_stage && (
                        <span
                          className="text-xs font-medium px-2 py-1 rounded-md"
                          style={{
                            backgroundColor: `${c.current_stage.color}20`,
                            color: c.current_stage.color,
                          }}
                        >
                          {c.current_stage.name}
                        </span>
                      )}
                      <p className="text-xs text-slate-500 mt-1">{formatDate(c.updated_at)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Activity History */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40">
            <div className="flex items-center gap-2 border-b border-slate-800/60 px-6 py-4">
              <Clock className="h-5 w-5 text-slate-400" />
              <h3 className="text-sm font-medium text-slate-200">Activity History</h3>
            </div>
            {activities.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-slate-500">No activity recorded yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/40">
                {activities.map((activity) => (
                  <div key={activity.id} className="px-6 py-3 flex items-start gap-3">
                    <div className="h-2 w-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-300">{activity.description}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {activity.user?.full_name} · {formatDateTime(activity.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Form */}
      <CustomerForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={() => { fetchCustomer(); fetchActivities(); }}
        customer={customer}
      />

      {/* Case Form */}
      <CaseForm
        isOpen={isCaseFormOpen}
        onClose={() => setIsCaseFormOpen(false)}
        onSuccess={() => { fetchCases(); fetchActivities(); }}
        preselectedCustomerId={customer.id}
      />
    </div>
  );
}
