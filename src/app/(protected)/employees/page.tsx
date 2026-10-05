'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Badge from '@/components/ui/Badge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { formatDate, getInitials } from '@/lib/utils';
import type { Profile } from '@/types';
import { UserCog } from 'lucide-react';

export default function EmployeesPage() {
  const supabase = createClient();
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchEmployees() {
      const { data } = await supabase
        .from('profiles')
        .select('*, role:roles(*)')
        .order('created_at', { ascending: false });

      setEmployees((data ?? []) as Profile[]);
      setIsLoading(false);
    }
    fetchEmployees();
  }, [supabase]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Employees</h1>
        <p className="mt-1 text-sm text-slate-400">
          View team members and their roles
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
          <TableSkeleton rows={5} cols={5} />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800/60">
                <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-200">
                        {getInitials(emp.full_name)}
                      </div>
                      <span className="text-sm font-medium text-slate-200">{emp.full_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">{emp.email}</td>
                  <td className="px-6 py-4">
                    <Badge
                      variant={
                        emp.role?.name === 'owner'
                          ? 'warning'
                          : emp.role?.name === 'manager'
                          ? 'info'
                          : 'default'
                      }
                    >
                      {emp.role?.name ? emp.role.name.toUpperCase() : 'EMPLOYEE'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={emp.is_active ? 'success' : 'danger'}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{formatDate(emp.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
