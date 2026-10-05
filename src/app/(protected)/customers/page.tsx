'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/Skeleton';
import CustomerForm from '@/components/customers/CustomerForm';
import { formatDate, capitalize } from '@/lib/utils';
import type { Customer } from '@/types';
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const PAGE_SIZE = 10;

export default function CustomersPage() {
  const supabase = createClient();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<(Customer & { cases_count: number })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select('*, cases(id)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search.trim()) {
        query = query.or(
          `full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`
        );
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const customersWithCount = (data ?? []).map((c) => ({
        ...c,
        cases_count: Array.isArray(c.cases) ? c.cases.length : 0,
        cases: undefined,
      })) as (Customer & { cases_count: number })[];

      setCustomers(customersWithCount);
      setTotalCount(count ?? 0);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast('Failed to load customers', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, search, page, toast]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Reset page when search changes
  useEffect(() => {
    setPage(0);
  }, [search]);

  const handleDelete = async () => {
    if (!deletingCustomer) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', deletingCustomer.id);

      if (error) throw error;
      toast('Customer deleted successfully', 'success');
      setDeletingCustomer(null);
      fetchCustomers();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete customer';
      toast(message, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Customers</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage your customer database ({totalCount} total)
          </p>
        </div>
        <Button onClick={() => { setEditingCustomer(null); setIsFormOpen(true); }}>
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
          <TableSkeleton rows={5} cols={6} />
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8 text-slate-500" />}
          title={search ? 'No customers found' : 'No customers yet'}
          description={
            search
              ? 'Try adjusting your search terms'
              : 'Get started by adding your first customer'
          }
          action={
            !search
              ? { label: 'Add Customer', onClick: () => { setEditingCustomer(null); setIsFormOpen(true); } }
              : undefined
          }
        />
      ) : (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800/60">
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Cases
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3.5 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="text-sm font-medium text-slate-200 hover:text-indigo-400 transition-colors"
                      >
                        {customer.full_name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {customer.phone ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {customer.email ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={customer.customer_type === 'business' ? 'info' : 'default'}>
                        {capitalize(customer.customer_type)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {customer.cases_count}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {formatDate(customer.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => { setEditingCustomer(customer); setIsFormOpen(true); }}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeletingCustomer(customer)}
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

      {/* Customer Form Modal */}
      <CustomerForm
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingCustomer(null); }}
        onSuccess={fetchCustomers}
        customer={editingCustomer}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingCustomer}
        onClose={() => setDeletingCustomer(null)}
        onConfirm={handleDelete}
        title="Delete Customer"
        message={`Are you sure you want to delete "${deletingCustomer?.full_name}"? This will also remove all associated cases and cannot be undone.`}
        confirmText="Delete"
        isLoading={isDeleting}
      />
    </div>
  );
}
