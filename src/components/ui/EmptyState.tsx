'use client';

import { cn } from '@/lib/utils';
import { FileQuestion } from 'lucide-react';
import Button from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4', className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/50 border border-slate-700/30 mb-4">
        {icon ?? <FileQuestion className="h-8 w-8 text-slate-500" />}
      </div>
      <h3 className="text-lg font-medium text-slate-200 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 text-center max-w-sm mb-6">{description}</p>
      {action && (
        <Button onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
