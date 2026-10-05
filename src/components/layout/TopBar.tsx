'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { Bell, Search, CheckCheck, ExternalLink, X } from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import type { Notification } from '@/types';

interface TopBarProps {
  isSidebarCollapsed: boolean;
}

export default function TopBar({ isSidebarCollapsed }: TopBarProps) {
  const { profile, user } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState<Notification[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUnread = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) return;
      const notifs = (data ?? []) as Notification[];
      setRecentNotifications(notifs);
      setUnreadCount(notifs.filter((n) => !n.is_read).length);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // Click outside listener for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/cases?search=${encodeURIComponent(search.trim())}`);
    }
  };

  const handleMarkAsRead = async (id: string, link?: string | null) => {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      setRecentNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      if (link) {
        setIsDropdownOpen(false);
        router.push(link);
      }
    } catch {
      // ignore
    }
  };

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-30 flex h-16 items-center justify-between border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md px-6 transition-all duration-300',
        isSidebarCollapsed ? 'left-[72px]' : 'left-[260px]'
      )}
    >
      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-3 max-w-md flex-1">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search cases, customers, or press Enter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
          />
        </div>
      </form>

      {/* Right side */}
      <div className="flex items-center gap-3 relative" ref={dropdownRef}>
        {/* Bell Button */}
        <button
          onClick={() => {
            setIsDropdownOpen(!isDropdownOpen);
            fetchUnread();
          }}
          className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white shadow-sm shadow-indigo-600/50">
              {unreadCount}
            </span>
          )}
        </button>

        {/* User Info */}
        <div className="ml-1 hidden sm:block">
          <p className="text-sm font-medium text-slate-200">{profile?.full_name ?? 'User'}</p>
          <p className="text-[11px] text-slate-500 font-mono capitalize">
            {profile?.role?.name || 'Staff'}
          </p>
        </div>

        {/* Notifications Popover Dropdown */}
        {isDropdownOpen && (
          <div className="absolute right-0 top-12 w-80 sm:w-96 rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-2xl z-50 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <Link
                href="/notifications"
                onClick={() => setIsDropdownOpen(false)}
                className="text-xs text-indigo-400 hover:underline font-medium"
              >
                View all
              </Link>
            </div>

            {/* List */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {recentNotifications.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">No notifications yet</p>
              ) : (
                recentNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => handleMarkAsRead(notif.id, notif.link)}
                    className={`rounded-lg p-2.5 text-xs transition-colors cursor-pointer border ${
                      !notif.is_read
                        ? 'border-indigo-500/30 bg-indigo-950/20 hover:bg-indigo-950/40'
                        : 'border-slate-800/60 bg-slate-900/40 hover:bg-slate-900/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-semibold ${!notif.is_read ? 'text-white' : 'text-slate-300'}`}>
                        {notif.title}
                      </p>
                      {!notif.is_read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0 mt-1" />
                      )}
                    </div>
                    {notif.message && (
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                        {notif.message}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500 mt-1">
                      {formatDateTime(notif.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-800/80 text-center">
              <Link
                href="/notifications"
                onClick={() => setIsDropdownOpen(false)}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                See all activity & alerts &rarr;
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
