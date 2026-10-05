'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { CardSkeleton } from '@/components/ui/Skeleton';
import {
  Users,
  Briefcase,
  ListTodo,
  AlertTriangle,
  TrendingUp,
  Clock,
} from 'lucide-react';
import type { DashboardStats } from '@/types';

export default function DashboardPage() {
  const { profile, role } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchStats() {
      try {
        const [customersRes, casesRes, tasksRes, overdueTasksRes] = await Promise.all([
          supabase.from('customers').select('id', { count: 'exact', head: true }),
          supabase.from('cases').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
          supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .in('status', ['pending', 'in_progress'])
            .lt('due_date', new Date().toISOString().split('T')[0]),
        ]);

        setStats({
          totalCustomers: customersRes.count ?? 0,
          activeCases: casesRes.count ?? 0,
          openTasks: tasksRes.count ?? 0,
          overdueTasks: overdueTasksRes.count ?? 0,
        });
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStats();
  }, [supabase]);

  const statCards = [
    {
      label: 'Total Customers',
      value: stats?.totalCustomers ?? 0,
      icon: Users,
      gradient: 'from-blue-500 to-cyan-500',
      shadowColor: 'shadow-blue-500/20',
      bgGlow: 'bg-blue-500/8',
    },
    {
      label: 'Active Cases',
      value: stats?.activeCases ?? 0,
      icon: Briefcase,
      gradient: 'from-indigo-500 to-purple-500',
      shadowColor: 'shadow-indigo-500/20',
      bgGlow: 'bg-indigo-500/8',
    },
    {
      label: 'Open Tasks',
      value: stats?.openTasks ?? 0,
      icon: ListTodo,
      gradient: 'from-amber-500 to-orange-500',
      shadowColor: 'shadow-amber-500/20',
      bgGlow: 'bg-amber-500/8',
    },
    {
      label: 'Overdue Tasks',
      value: stats?.overdueTasks ?? 0,
      icon: AlertTriangle,
      gradient: 'from-red-500 to-rose-500',
      shadowColor: 'shadow-red-500/20',
      bgGlow: 'bg-red-500/8',
    },
  ];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          {getGreeting()}, {profile?.full_name?.split(' ')[0] ?? 'there'}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Here&apos;s what&apos;s happening with your business today.
        </p>
      </div>

      {/* Stats Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="relative group rounded-xl border border-slate-800/60 bg-slate-900/40 p-6 overflow-hidden hover:border-slate-700/60 transition-all duration-300"
            >
              <div className={`absolute top-0 right-0 w-32 h-32 ${card.bgGlow} rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:scale-110 transition-transform`} />
              <div className="relative">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${card.gradient} shadow-lg ${card.shadowColor}`}>
                  <card.icon className="h-5 w-5 text-white" />
                </div>
                <p className="mt-4 text-3xl font-bold text-white">{card.value}</p>
                <p className="mt-1 text-sm text-slate-400">{card.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick info sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity Placeholder */}
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-slate-400" />
            <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
          </div>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="h-10 w-10 text-slate-600 mb-3" />
            <p className="text-sm text-slate-500">Activity feed will appear here</p>
            <p className="text-xs text-slate-600 mt-1">
              Actions on customers and cases will be logged
            </p>
          </div>
        </div>

        {/* Quick Stats Placeholder */}
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-slate-400" />
            <h3 className="text-lg font-semibold text-white">Overview</h3>
          </div>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <TrendingUp className="h-10 w-10 text-slate-600 mb-3" />
            <p className="text-sm text-slate-500">Business overview will appear here</p>
            <p className="text-xs text-slate-600 mt-1">
              Charts and analytics coming soon
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
