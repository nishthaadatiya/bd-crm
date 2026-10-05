// Database types matching the Supabase schema

export type UserRole = 'owner' | 'manager' | 'employee';

export interface Role {
  id: string;
  name: UserRole;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role_id: string;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  role?: Role;
}

export type CustomerType = 'individual' | 'business';

export interface Customer {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  customer_type: CustomerType;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  cases_count?: number;
}

export interface Building {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  created_by_profile?: Profile;
}

export interface WorkflowStage {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  color: string;
  is_active: boolean;
  responsible_role_id?: string | null;
  default_assigned_employee_id?: string | null;
  sla_days: number;
  required_task_title?: string | null;
  created_at: string;
  updated_at: string;
  responsible_role?: Role;
  default_employee?: Profile;
}

export type CaseStatus = 'new' | 'in_progress' | 'waiting' | 'blocked' | 'completed' | 'cancelled';
export type CasePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Case {
  id: string;
  case_number: string;
  customer_id: string;
  building_id: string | null;
  case_type: string;
  status: CaseStatus;
  priority: CasePriority;
  current_stage_id: string | null;
  assigned_to: string | null;
  stage_entered_at?: string | null;
  stage_due_date?: string | null;
  description: string | null;
  notes: string | null;
  expected_completion_date: string | null;
  // Financial & Loan Details
  loan_amount?: number | null;
  loan_type?: string | null;
  loan_tenure_months?: number | null;
  interest_rate?: number | null;
  property_value?: number | null;
  bank_name?: string | null;
  application_number?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  building?: Building;
  assigned_profile?: Profile;
  current_stage?: WorkflowStage;
}

export interface CaseStageHistory {
  id: string;
  case_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  changed_by: string | null;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  from_stage?: WorkflowStage;
  to_stage?: WorkflowStage;
  changed_by_profile?: Profile;
  assigned_profile?: Profile;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface Task {
  id: string;
  case_id: string | null;
  stage_id?: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: CasePriority;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assigned_profile?: Profile;
  case?: Case;
  stage?: WorkflowStage;
}

export type DocumentUploadStatus = 'uploaded' | 'under_review' | 'approved' | 'rejected';

export interface DocumentRequirement {
  id: string;
  stage_id: string;
  name: string;
  description: string | null;
  is_mandatory: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stage?: WorkflowStage;
  latest_upload?: DocumentUpload;
}

export interface DocumentUpload {
  id: string;
  case_id: string;
  requirement_id: string | null;
  document_name: string;
  original_filename: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  status: DocumentUploadStatus;
  rejection_reason: string | null;
  version: number;
  uploaded_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  requirement?: DocumentRequirement;
  uploaded_by_profile?: Profile;
  reviewed_by_profile?: Profile;
}

export interface CaseComment {
  id: string;
  case_id: string;
  user_id: string;
  message: string;
  created_at: string;
  updated_at: string;
  user?: Profile;
}

export interface Document {
  id: string;
  case_id: string | null;
  customer_id: string | null;
  name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  case_id: string | null;
  customer_id: string | null;
  user_id: string | null;
  action: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user?: Profile;
}

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  type: NotificationType;
  is_read: boolean;
  link: string | null;
  related_case_id: string | null;
  related_task_id: string | null;
  created_at: string;
}

// Form types
export interface CustomerFormData {
  full_name: string;
  phone: string;
  email: string;
  address: string;
  customer_type: CustomerType;
  notes: string;
}

export interface CaseFormData {
  customer_id: string;
  building_id: string;
  case_type: string;
  status: CaseStatus;
  priority: CasePriority;
  current_stage_id: string;
  assigned_to: string;
  description: string;
  notes: string;
  expected_completion_date: string;
  // Financial & Loan Details
  loan_amount?: string;
  loan_type?: string;
  loan_tenure_months?: string;
  interest_rate?: string;
  property_value?: string;
  bank_name?: string;
  application_number?: string;
}

export interface BuildingFormData {
  name: string;
  code: string;
  address: string;
  description: string;
  is_active: boolean;
}

// Dashboard stats
export interface DashboardStats {
  totalCustomers: number;
  activeCases: number;
  openTasks: number;
  overdueTasks: number;
}

// Dashboard & Business Analytics Types
export type DashboardDatePreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'custom';

export interface DashboardFilterState {
  preset: DashboardDatePreset;
  startDate: string | null;
  endDate: string | null;
  buildingId: string | null;
}

export interface DashboardKPIs {
  total_cases: number;
  new_cases: number;
  active_cases: number;
  completed_cases: number;
  blocked_cases: number;
  overdue_cases: number;
  total_loan_amount: number;
  active_loan_amount: number;
  completed_loan_amount: number;
}

export interface StagePipelineMetric {
  stage_id: string;
  stage_name: string;
  stage_color: string;
  display_order: number;
  sla_days: number;
  case_count: number;
  total_loan_amount: number;
  overdue_count: number;
  avg_duration_days: number;
}

export interface ProjectPerformanceMetric {
  building_id: string;
  building_name: string;
  building_code: string | null;
  total_cases: number;
  active_cases: number;
  completed_cases: number;
  blocked_cases: number;
  overdue_cases: number;
  total_loan_value: number;
  avg_completion_days: number;
}

export interface LoanByTypeMetric {
  product_type: string;
  case_count: number;
  total_loan_amount: number;
}

export interface EmployeeWorkloadMetric {
  employee_id: string;
  employee_name: string;
  employee_email: string;
  role_name: string;
  active_cases: number;
  total_assigned_cases: number;
  completed_cases: number;
  open_tasks: number;
  overdue_tasks: number;
  avg_turnaround_days: number;
}

export interface AttentionItem {
  id: string;
  case_number: string;
  customer_name: string;
  building_name?: string | null;
  stage_name?: string | null;
  type: 'overdue' | 'blocked' | 'waiting_docs' | 'approaching_deadline';
  detail: string;
  due_date?: string | null;
}
