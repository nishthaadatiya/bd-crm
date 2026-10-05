'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { formatDateTime } from '@/lib/utils';
import type { Notification } from '@/types';
import {
  Bell,
  CheckCircle,
  AlertTriangle,
  Info,
  XCircle,
  CheckCheck,
  Trash2,
  ExternalLink,
  Briefcase,
  ListTodo,
} from 'lucide-react';

export default function NotificationsPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === 'PGRST205' || error.message.includes('does not exist')) {
          setNotifications([]);
          return;
        }
        throw error;
      }
      setNotifications((data ?? []) as Notification[]);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      toast('Failed to load notifications', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user, toast]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (notif: Notification) => {
    if (notif.is_read) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notif.id);

      if (error) throw error;
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
    } catch {
      // ignore
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
      toast('All notifications marked as read', 'success');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      toast('Failed to mark all as read', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('notifications').delete().eq('id', id);
      if (error) throw error;
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast('Notification removed', 'info');
    } catch {
      toast('Failed to delete notification', 'error');
    }
  };

  const handleNotificationClick = async (notif: Notification) => {
    await handleMarkAsRead(notif);
    if (notif.link) {
      router.push(notif.link);
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread') return !n.is_read;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const renderIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-rose-400 shrink-0" />;
      default:
        return <Info className="h-5 w-5 text-indigo-400 shrink-0" />;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="h-6 w-6 text-indigo-400" />
            Notifications
            {unreadCount > 0 && (
              <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-semibold">
                {unreadCount} new
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Real-time alerts for case assignments, document reviews, and workflow events
          </p>
        </div>

        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" onClick={handleMarkAllAsRead}>
            <CheckCheck className="h-4 w-4" />
            Mark All as Read
          </Button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            filter === 'all'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            filter === 'unread'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Notifications List */}
      {isLoading ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
          <TableSkeleton rows={4} cols={4} />
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-8">
          <EmptyState
            icon={<Bell className="h-8 w-8 text-slate-500" />}
            title={filter === 'unread' ? 'No unread notifications' : 'No notifications'}
            description={
              filter === 'unread'
                ? "You've read all your notifications!"
                : 'System alerts and assignments will appear here as activity occurs.'
            }
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredNotifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => handleNotificationClick(notif)}
              className={`rounded-xl border p-4 transition-all flex items-start justify-between gap-4 cursor-pointer ${
                !notif.is_read
                  ? 'border-indigo-500/40 bg-indigo-950/20 hover:border-indigo-500/60'
                  : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700/80'
              }`}
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {renderIcon(notif.type)}
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm ${!notif.is_read ? 'font-semibold text-white' : 'font-medium text-slate-300'}`}>
                      {notif.title}
                    </p>
                    {!notif.is_read && (
                      <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                    )}
                  </div>
                  {notif.message && (
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {notif.message}
                    </p>
                  )}
                  <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-500">
                    <span>{formatDateTime(notif.created_at)}</span>
                    {notif.link && (
                      <span className="text-indigo-400 flex items-center gap-1">
                        View details <ExternalLink className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleDelete(notif.id)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Delete notification"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
