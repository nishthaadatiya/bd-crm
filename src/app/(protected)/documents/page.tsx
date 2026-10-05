'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import Textarea from '@/components/ui/Textarea';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { formatDate, formatDateTime, capitalize } from '@/lib/utils';
import { sendNotification } from '@/lib/workflow';
import type { DocumentUpload, DocumentUploadStatus, Building } from '@/types';
import {
  FileText,
  Search,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  Upload,
  Briefcase,
  Building2,
  User,
  Filter,
  Download,
  AlertCircle,
} from 'lucide-react';

interface DocumentWithRelations extends DocumentUpload {
  case?: {
    id: string;
    case_number: string;
    customer?: { id: string; full_name: string };
    building?: { id: string; name: string; code: string | null };
  };
}

export default function DocumentsPage() {
  const supabase = createClient();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isOwnerOrManager = role === 'owner' || role === 'manager';

  const [documents, setDocuments] = useState<DocumentWithRelations[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');

  // Review (Reject) Modal State
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectingUpload, setRejectingUpload] = useState<DocumentWithRelations | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const [docsRes, buildingsRes] = await Promise.all([
        supabase
          .from('document_uploads')
          .select(`
            *,
            case:cases(
              id,
              case_number,
              customer:customers(id, full_name),
              building:buildings(id, name, code)
            ),
            uploaded_by_profile:profiles!document_uploads_uploaded_by_fkey(id, full_name),
            reviewed_by_profile:profiles!document_uploads_reviewed_by_fkey(id, full_name)
          `)
          .order('created_at', { ascending: false }),
        supabase.from('buildings').select('*').order('name', { ascending: true }),
      ]);

      if (docsRes.error) {
        if (docsRes.error.code === 'PGRST205' || docsRes.error.message.includes('does not exist')) {
          setDocuments([]);
          return;
        }
        throw docsRes.error;
      }

      setDocuments((docsRes.data ?? []) as DocumentWithRelations[]);
      setBuildings((buildingsRes.data ?? []) as Building[]);
    } catch (err) {
      console.error('Error fetching documents:', err);
      toast('Failed to load documents', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Handle Download / Signed URL
  const handleDownload = async (doc: DocumentWithRelations) => {
    try {
      const { data, error } = await supabase.storage
        .from('case-documents')
        .createSignedUrl(doc.file_path, 3600);

      if (error || !data?.signedUrl) {
        const { data: pubData } = supabase.storage
          .from('case-documents')
          .getPublicUrl(doc.file_path);

        if (pubData?.publicUrl) {
          window.open(pubData.publicUrl, '_blank');
          return;
        }
        throw new Error(error?.message || 'Failed to generate download link');
      }

      window.open(data.signedUrl, '_blank');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      toast(msg, 'error');
    }
  };

  // Document Review: Approve
  const handleApprove = async (doc: DocumentWithRelations) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('document_uploads')
        .update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', doc.id);

      if (error) throw error;

      // Log activity
      await supabase.from('activities').insert({
        case_id: doc.case_id,
        user_id: user.id,
        action: 'document_approved',
        description: `Approved "${doc.document_name}" (v${doc.version}) for case ${doc.case?.case_number || ''}`,
      });

      // Notify uploader
      if (doc.uploaded_by && doc.uploaded_by !== user.id) {
        await sendNotification(
          supabase,
          doc.uploaded_by,
          `Document Approved: ${doc.document_name}`,
          `Your document ${doc.document_name} (v${doc.version}) has been verified and approved.`,
          'success',
          `/cases/${doc.case_id}`,
          doc.case_id
        );
      }

      toast(`Document "${doc.document_name}" approved`, 'success');
      fetchDocuments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approval failed';
      toast(msg, 'error');
    }
  };

  // Open Reject Modal
  const handleOpenRejectModal = (doc: DocumentWithRelations) => {
    setRejectingUpload(doc);
    setRejectionReason('');
    setIsRejectModalOpen(true);
  };

  // Document Review: Reject
  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingUpload || !user) return;

    if (!rejectionReason.trim()) {
      toast('Please provide a reason for rejecting this document', 'error');
      return;
    }

    setIsReviewing(true);
    try {
      const { error } = await supabase
        .from('document_uploads')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason.trim(),
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', rejectingUpload.id);

      if (error) throw error;

      // Log activity
      await supabase.from('activities').insert({
        case_id: rejectingUpload.case_id,
        user_id: user.id,
        action: 'document_rejected',
        description: `Rejected "${rejectingUpload.document_name}" (v${rejectingUpload.version}): ${rejectionReason.trim()}`,
      });

      // Notify uploader
      if (rejectingUpload.uploaded_by && rejectingUpload.uploaded_by !== user.id) {
        await sendNotification(
          supabase,
          rejectingUpload.uploaded_by,
          `Document Rejected: ${rejectingUpload.document_name}`,
          `Reason: ${rejectionReason.trim()}. Please upload a revised version.`,
          'warning',
          `/cases/${rejectingUpload.case_id}`,
          rejectingUpload.case_id
        );
      }

      toast(`Document rejected and notification sent`, 'warning');
      setIsRejectModalOpen(false);
      fetchDocuments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rejection failed';
      toast(msg, 'error');
    } finally {
      setIsReviewing(false);
    }
  };

  const renderStatusBadge = (status: DocumentUploadStatus) => {
    switch (status) {
      case 'approved':
        return (
          <Badge variant="success">
            <CheckCircle className="h-3 w-3 mr-1" /> Approved
          </Badge>
        );
      case 'under_review':
        return (
          <Badge variant="info">
            <Clock className="h-3 w-3 mr-1" /> Under Review
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="danger">
            <XCircle className="h-3 w-3 mr-1" /> Rejected
          </Badge>
        );
      case 'uploaded':
        return (
          <Badge variant="info">
            <Upload className="h-3 w-3 mr-1" /> Uploaded
          </Badge>
        );
      default:
        return <Badge variant="default">{capitalize(status)}</Badge>;
    }
  };

  // Filter documents
  const filteredDocuments = documents.filter((doc) => {
    if (statusFilter !== 'all' && doc.status !== statusFilter) return false;
    if (buildingFilter !== 'all' && doc.case?.building?.id !== buildingFilter) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchDocName = doc.document_name.toLowerCase().includes(q);
      const matchFilename = doc.original_filename.toLowerCase().includes(q);
      const matchCase = doc.case?.case_number.toLowerCase().includes(q);
      const matchCustomer = doc.case?.customer?.full_name.toLowerCase().includes(q);
      const matchBuilding = doc.case?.building?.name.toLowerCase().includes(q);
      if (!matchDocName && !matchFilename && !matchCase && !matchCustomer && !matchBuilding) {
        return false;
      }
    }

    return true;
  });

  const totalApproved = documents.filter((d) => d.status === 'approved').length;
  const totalUnderReview = documents.filter(
    (d) => d.status === 'under_review' || d.status === 'uploaded'
  ).length;
  const totalRejected = documents.filter((d) => d.status === 'rejected').length;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-indigo-400" />
            Document Repository
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            View, review, and track customer files and case documentation
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
          <p className="text-xs font-medium text-slate-400">Total Uploaded</p>
          <p className="text-2xl font-bold text-white mt-1">{documents.length}</p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
          <p className="text-xs font-medium text-slate-400">Approved</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{totalApproved}</p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
          <p className="text-xs font-medium text-slate-400">Under Review</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{totalUnderReview}</p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
          <p className="text-xs font-medium text-slate-400">Rejected Revisions</p>
          <p className="text-2xl font-bold text-rose-400 mt-1">{totalRejected}</p>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by document name, file name, case number, or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-slate-400 mr-1">
            <Filter className="h-3.5 w-3.5" />
            <span>Filter:</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="all">All Statuses</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="uploaded">Uploaded</option>
          </select>

          <select
            value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="all">All Buildings</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
          <TableSkeleton rows={5} cols={7} />
        </div>
      ) : filteredDocuments.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8 text-slate-500" />}
          title={search || statusFilter !== 'all' ? 'No matching documents' : 'No documents found'}
          description="Documents uploaded to customer cases will be listed and tracked here."
        />
      ) : (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-xs font-semibold text-slate-400 uppercase tracking-wider text-left">
                  <th className="px-5 py-3.5">Document</th>
                  <th className="px-5 py-3.5">Case / Customer</th>
                  <th className="px-5 py-3.5">Building</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Uploaded</th>
                  <th className="px-5 py-3.5">Review Feedback</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-start gap-2.5">
                        <FileText className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-white">{doc.document_name}</span>
                            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.2 rounded">
                              v{doc.version}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs truncate">
                            {doc.original_filename}
                            {doc.file_size ? ` (${(doc.file_size / 1024).toFixed(0)} KB)` : ''}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      {doc.case ? (
                        <div>
                          <Link
                            href={`/cases/${doc.case.id}`}
                            className="font-mono text-xs font-bold text-indigo-400 hover:underline flex items-center gap-1"
                          >
                            <Briefcase className="h-3 w-3" />
                            {doc.case.case_number}
                          </Link>
                          {doc.case.customer && (
                            <p className="text-xs text-slate-300 mt-0.5">
                              {doc.case.customer.full_name}
                            </p>
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-xs text-slate-300">
                      {doc.case?.building ? (
                        <span className="flex items-center gap-1 text-indigo-300 font-medium">
                          <Building2 className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                          {doc.case.building.name}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5">{renderStatusBadge(doc.status)}</td>

                    <td className="px-5 py-3.5 text-xs text-slate-400">
                      <div>
                        <p className="text-slate-300">{formatDate(doc.created_at)}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          By {doc.uploaded_by_profile?.full_name || 'Staff'}
                        </p>
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-xs text-slate-400 max-w-xs">
                      {doc.rejection_reason ? (
                        <div className="rounded bg-rose-500/10 border border-rose-500/20 p-1.5 text-rose-300 text-[11px]">
                          {doc.rejection_reason}
                        </div>
                      ) : doc.reviewed_at ? (
                        <span className="text-emerald-400 text-[11px] flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Verified by{' '}
                          {doc.reviewed_by_profile?.full_name || 'Staff'}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Pending review</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleDownload(doc)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
                          title="Download document"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>View</span>
                        </button>

                        {isOwnerOrManager &&
                          (doc.status === 'uploaded' || doc.status === 'under_review') && (
                            <>
                              <button
                                onClick={() => handleApprove(doc)}
                                className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                                title="Approve"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleOpenRejectModal(doc)}
                                className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                title="Reject"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            </>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title={`Reject: ${rejectingUpload?.document_name}`}
        size="md"
      >
        <form onSubmit={handleRejectSubmit} className="space-y-4">
          <p className="text-xs text-slate-400">
            Please enter the reason for rejection. This will be recorded and sent as an in-app notification to the staff member who uploaded this revision.
          </p>

          <Textarea
            id="rep_rejection_reason"
            label="Rejection Reason *"
            placeholder="e.g. Scanned copy is illegible or document is expired. Please re-upload a clear copy."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={4}
            autoFocus
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setIsRejectModalOpen(false)}
              disabled={isReviewing}
            >
              Cancel
            </Button>
            <Button variant="danger" type="submit" isLoading={isReviewing}>
              Confirm Rejection
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
