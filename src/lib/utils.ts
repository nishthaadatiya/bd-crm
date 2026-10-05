import { type ClassValue, clsx } from 'clsx';

// Lightweight clsx replacement (no extra dependency)
export function cn(...inputs: (string | undefined | null | false | Record<string, boolean>)[]) {
  return inputs
    .flatMap((input) => {
      if (!input) return [];
      if (typeof input === 'string') return [input];
      return Object.entries(input)
        .filter(([, value]) => value)
        .map(([key]) => key);
    })
    .join(' ');
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    open: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    in_progress: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    on_hold: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    closed: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
    pending: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    cancelled: 'bg-red-500/15 text-red-400 border-red-500/20',
  };
  return colors[status] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/20';
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    low: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
    medium: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    high: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    urgent: 'bg-red-500/15 text-red-400 border-red-500/20',
  };
  return colors[priority] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/20';
}

export function capitalize(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
