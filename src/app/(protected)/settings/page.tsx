'use client';

import { useAuth } from '@/contexts/AuthContext';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import WorkflowStageManager from '@/components/settings/WorkflowStageManager';
import DocumentRequirementManager from '@/components/settings/DocumentRequirementManager';
import { getInitials } from '@/lib/utils';
import { User, Shield } from 'lucide-react';

export default function SettingsPage() {
  const { profile, role } = useAuth();
  const isOwnerOrManager = role === 'owner' || role === 'manager';

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage your account settings, permissions, and workflow stage rules
        </p>
      </div>

      {/* Profile Section */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6 space-y-6">
        <div className="flex items-center gap-2 text-slate-200 font-semibold border-b border-slate-800/60 pb-4">
          <User className="h-5 w-5 text-indigo-400" />
          Profile Information
        </div>

        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-xl font-bold text-slate-200">
            {profile ? getInitials(profile.full_name) : '??'}
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">{profile?.full_name}</h3>
            <p className="text-sm text-slate-400">{profile?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <Input label="Full Name" value={profile?.full_name ?? ''} readOnly disabled />
          <Input label="Email Address" value={profile?.email ?? ''} readOnly disabled />
        </div>
      </div>

      {/* Role Section */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-200 font-semibold border-b border-slate-800/60 pb-4">
          <Shield className="h-5 w-5 text-indigo-400" />
          Role & Permissions
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-200">Assigned Role</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Your role determines what features and actions you can access
            </p>
          </div>
          <Badge variant={role === 'owner' ? 'warning' : role === 'manager' ? 'info' : 'default'}>
            {role ? role.toUpperCase() : 'EMPLOYEE'}
          </Badge>
        </div>
      </div>

      {/* Workflow Stage Configurator (Owner & Manager access) */}
      {isOwnerOrManager && <WorkflowStageManager />}

      {/* Document Requirements Configurator (Owner & Manager access) */}
      {isOwnerOrManager && <DocumentRequirementManager />}
    </div>
  );
}
