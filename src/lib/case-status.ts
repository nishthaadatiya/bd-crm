export const CASE_STATUS_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'doc_collection', label: 'Doc collection' },
  { value: 'doc_verification', label: 'Doc verification' },
  { value: 'property_ips_processing', label: 'Property / IPS processing' },
  { value: 'search', label: 'Search' },
  { value: 'valuation', label: 'Valuation' },
  { value: 'login', label: 'Login' },
  { value: 'sanction', label: 'Sanction' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'disbursement', label: 'Disbursement' },
  { value: 'payout', label: 'Payout' },
  { value: 'closed', label: 'Closed' },
];

// Keep historical values readable without guessing which loan step they represent.
const LEGACY_LABELS: Record<string, string> = {
  new: 'Lead', completed: 'Closed', in_progress: 'In Progress (legacy)',
  waiting: 'Waiting (legacy)', blocked: 'Blocked (legacy)', cancelled: 'Cancelled (legacy)',
};

export function normalizeCaseStatus(status: string): string {
  return status === 'new' ? 'lead' : status === 'completed' ? 'closed' : status;
}

export function getCaseStatusLabel(status: string): string {
  return CASE_STATUS_OPTIONS.find((option) => option.value === status)?.label
    || LEGACY_LABELS[status] || status;
}

export function getCaseStatusOptions(currentStatus?: string) {
  const current = currentStatus && normalizeCaseStatus(currentStatus);
  return current && !CASE_STATUS_OPTIONS.some((option) => option.value === current)
    ? [{ value: current, label: getCaseStatusLabel(current) }, ...CASE_STATUS_OPTIONS]
    : CASE_STATUS_OPTIONS;
}

export function isClosedCase(status: string) {
  return normalizeCaseStatus(status) === 'closed';
}

export function isActiveCase(status: string) {
  return !isClosedCase(status) && status !== 'cancelled';
}

export const TERMINAL_CASE_STATUSES = '("closed","completed","cancelled")';

export function getStatusForWorkflowStage(stageName: string, currentStatus: string): string {
  const name = stageName.trim().toLowerCase();
  const match = CASE_STATUS_OPTIONS.find((option) => option.label.toLowerCase() === name);
  if (match) return match.value;
  if (name.includes('completion') || name === 'closure') return 'closed';
  return normalizeCaseStatus(currentStatus);
}
