'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getInitials } from '@/lib/utils';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  ListTodo,
  FileText,
  UserCog,
  BarChart3,
  Bell,
  Settings,
  LogOut,
  ChevronLeft,
  Building2,
} from 'lucide-react';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cases', label: 'Cases', icon: Briefcase },
  { href: '/buildings', label: 'Buildings', icon: Building2 },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/tasks', label: 'My Tasks', icon: ListTodo },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/employees', label: 'Employees', icon: UserCog },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { profile, role, signOut } = useAuth();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-slate-800/60 bg-slate-950 transition-all duration-300',
        isCollapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      {/* Logo area */}
      <div className="flex h-16 items-center justify-between border-b border-slate-800/60 px-4">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          {!isCollapsed && (
            <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              CRM Pro
            </span>
          )}
        </Link>
        <button
          onClick={onToggle}
          className={cn(
            'rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-all cursor-pointer',
            isCollapsed && 'rotate-180'
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative',
                isActive
                  ? 'bg-indigo-500/10 text-indigo-400'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-indigo-500" />
              )}
              <item.icon className={cn('h-5 w-5 shrink-0', isActive && 'text-indigo-400')} />
              {!isCollapsed && <span>{item.label}</span>}
              {isCollapsed && (
                <div className="absolute left-full ml-2 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-slate-700/50 shadow-xl z-50">
                  {item.label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-slate-800/60 p-3">
        <div className={cn('flex items-center gap-3 rounded-lg p-2', !isCollapsed && 'pr-1')}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-xs font-bold text-slate-200">
            {profile ? getInitials(profile.full_name) : '??'}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">
                {profile?.full_name ?? 'Loading...'}
              </p>
              <p className="text-xs text-slate-500 capitalize">{role ?? '...'}</p>
            </div>
          )}
          {!isCollapsed && (
            <button
              onClick={signOut}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-red-400 transition-colors cursor-pointer"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
