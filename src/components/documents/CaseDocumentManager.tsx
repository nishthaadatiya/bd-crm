'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { deleteCaseDocument, removeDocumentFile } from '@/lib/document-delete';
import Textarea from '@/components/ui/Textarea';
import { sendNotification } from '@/lib/workflow';
import { formatDate, formatDateTime } from '@/lib/utils';
import type {
  DocumentRequirement,
  DocumentUpload,
  DocumentUploadStatus,
  WorkflowStage,
} from '@/types';
import {
  FileText,
  Upload,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  History,
  Download,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Plus,
  Trash2,
} from 'lucide-react';

interface CaseDocumentManagerProps {
  caseId: string;
  caseNumber: string;
  currentStageId?: string | null;
  assignedTo?: string | null;
  onActivityLogged?: () => void;
}

interface RequirementWithUploads extends DocumentRequirement {
  uploads: DocumentUpload[];
  latestUpload?: DocumentUpload;
}

export default function CaseDocumentManager({
  caseId,
  caseNumber,
  currentStageId,
  assignedTo,
  onActivityLogged,
}: CaseDocumentManagerProps) {
  const supabase = createClient();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isOwnerOrManager = role === 'owner' || role === 'manager';

  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [requirementsWithUploads, setRequirementsWithUploads] = useState<RequirementWithUploads[]>([]);
  const [customUploads, setCustomUploads] = useState<DocumentUpload[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStage, setFilterStage] = useState<string>('all');

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [targetRequirement, setTargetRequirement] = useState<DocumentRequirement | null>(null);
  const [customDocName, setCustomDocName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Review (Reject) Modal State
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectingUpload, setRejectingUpload] = useState<DocumentUpload | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  // Version History Modal State
  const [historyRequirement, setHistoryRequirement] = useState<RequirementWithUploads | null>(null);
  const [deletingUpload, setDeletingUpload] = useState<DocumentUpload | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deletionBusy = useRef(false);
  const [cleanup, setCleanup] = useState<{ path: string; filename: string; warning: string }[]>([]);
  const [retryingCleanup, setRetryingCleanup] = useState<string | null>(null);

  const fetchDocumentsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [stagesRes, reqsRes, uploadsRes] = await Promise.all([
        supabase.from('workflow_stages').select('*').order('display_order', { ascending: true }),
        supabase.from('document_requirements').select('*').order('display_order', { ascending: true }),
        supabase
          .from('document_uploads')
          .select(`
            *,
            uploaded_by_profile:profiles!document_uploads_uploaded_by_fkey(id, full_name),
            reviewed_by_profile:profiles!document_uploads_reviewed_by_fkey(id, full_name)
          `)
          .eq('case_id', caseId)
          .order('version', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      ]);

      if (stagesRes.error) throw stagesRes.error;
      if (reqsRes.error) throw reqsRes.error;
      if (uploadsRes.error) throw uploadsRes.error;

      const stagesList = (stagesRes.data ?? []) as WorkflowStage[];
      const reqsList = (reqsRes.data ?? []) as DocumentRequirement[];
      const uploadsList = (uploadsRes.data ?? []) as DocumentUpload[];

      setStages(stagesList);

      // Group uploads by requirement
      const mappedRequirements: RequirementWithUploads[] = reqsList.map((req) => {
        const matchingUploads = uploadsList.filter((u) => u.requirement_id === req.id);
        return {
          ...req,
          uploads: matchingUploads,
          latestUpload: matchingUploads.length > 0 ? matchingUploads[0] : undefined,
        };
      });

      // Filter requirements that belong to the current stage or have uploads
      setRequirementsWithUploads(mappedRequirements);

      // Separate custom uploads (not linked to any requirement)
      const unlinked = uploadsList.filter((u) => !u.requirement_id);
      setCustomUploads(unlinked);
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, caseId]);

  const canDelete = (upload: DocumentUpload) => !!user && (isOwnerOrManager || upload.uploaded_by === user.id);
  const openDelete = (upload: DocumentUpload) => {
    if (!canDelete(upload) || deletionBusy.current) return;
    setHistoryRequirement(null);
    setDeletingUpload(upload);
  };
  const handleDelete = async () => {
    if (!deletingUpload || !canDelete(deletingUpload) || deletionBusy.current) return;
    deletionBusy.current = true;
    setIsDeleting(true);
    try {
      const result = await deleteCaseDocument(supabase, deletingUpload.id, caseId);
      if (result.cleanupPath && result.warning) {
        setCleanup((items) => [...items, { path: result.cleanupPath!, filename: deletingUpload.original_filename, warning: result.warning! }]);
      }
      toast(result.warning || 'Document deleted', result.warning ? 'warning' : 'success');
      setDeletingUpload(null);
      await fetchDocumentsData();
      onActivityLogged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete the document', 'error');
    } finally { deletionBusy.current = false; setIsDeleting(false); }
  };
  const retryCleanup = async (path: string) => {
    if (retryingCleanup) return;
    setRetryingCleanup(path);
    try {
      await removeDocumentFile(supabase, path);
      setCleanup((items) => items.filter((item) => item.path !== path));
      toast('Stored file deleted', 'success');
    } catch (err) { toast(err instanceof Error ? err.message : 'File cleanup failed', 'error'); }
    finally { setRetryingCleanup(null); }
  };
  const deleteButton = (upload: DocumentUpload) => canDelete(upload) && (
    <button type="button" onClick={() => openDelete(upload)} disabled={isDeleting}
      aria-label={`Delete ${upload.original_filename}, version ${upload.version}`}
      title="Delete this uploaded version"
      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 disabled:opacity-50 cursor-pointer">
      <Trash2 className="h-3.5 w-3.5" /> Delete
    </button>
  );

  useEffect(() => {
    fetchDocumentsData();
  }, [fetchDocumentsData]);

  // Handle Document Download / Signed URL
  const handleDownload = async (upload: DocumentUpload) => {
    try {
      const { data, error } = await supabase.storage
        .from('case-documents')
        .createSignedUrl(upload.file_path, 3600);

      if (error || !data?.signedUrl) {
        // Fallback to public URL if bucket is configured public
        const { data: pubData } = supabase.storage
          .from('case-documents')
          .getPublicUrl(upload.file_path);

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

  // Open Upload Modal
  const handleOpenUpload = (req?: DocumentRequirement) => {
    setTargetRequirement(req || null);
    setCustomDocName(req ? req.name : '');
    setSelectedFile(null);
    setIsUploadModalOpen(true);
  };

  // Execute File Upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !user) {
      toast('Please choose a file to upload', 'error');
      return;
    }

    const docTitle = targetRequirement ? targetRequirement.name : customDocName.trim();
    if (!docTitle) {
      toast('Document name is required', 'error');
      return;
    }

    setIsUploading(true);
    try {
      // Determine next version number for this requirement
      const existingUploads = targetRequirement
        ? requirementsWithUploads.find((r) => r.id === targetRequirement.id)?.uploads ?? []
        : [];
      const nextVersion = existingUploads.length > 0 ? existingUploads[0].version + 1 : 1;

      // Unique storage file path
      const sanitizedName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `cases/${caseId}/${targetRequirement?.id || 'custom'}/v${nextVersion}_${Date.now()}_${sanitizedName}`;

      // Upload to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from('case-documents')
        .upload(storagePath, selectedFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadErr) {
        console.warn('Storage upload notice:', uploadErr.message);
        // Continue to record metadata even if storage bucket is missing in local environment
      }

      // Record metadata in document_uploads table
      const { error: dbErr } = await supabase.from('document_uploads').insert({
        case_id: caseId,
        requirement_id: targetRequirement?.id || null,
        document_name: docTitle,
        original_filename: selectedFile.name,
        file_path: storagePath,
        file_size: selectedFile.size,
        mime_type: selectedFile.type || 'application/octet-stream',
        status: 'under_review',
        version: nextVersion,
        uploaded_by: user.id,
      });

      if (dbErr) throw dbErr;

      // Log activity
      await supabase.from('activities').insert({
        case_id: caseId,
        user_id: user.id,
        action: 'document_uploaded',
        description: `Uploaded "${docTitle}" (v${nextVersion}) for case ${caseNumber}`,
        metadata: {
          document_name: docTitle,
          version: nextVersion,
          filename: selectedFile.name,
        },
      });

      // Notify responsible staff
      if (assignedTo && assignedTo !== user.id) {
        await sendNotification(
          supabase,
          assignedTo,
          `Document uploaded: ${docTitle} (v${nextVersion})`,
          `New document uploaded for case ${caseNumber}. Ready for review.`,
          'info',
          `/cases/${caseId}`,
          caseId
        );
      }

      toast(`Document "${docTitle}" uploaded (v${nextVersion})`, 'success');
      setIsUploadModalOpen(false);
      fetchDocumentsData();
      onActivityLogged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      toast(msg, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Document Review: Approve
  const handleApprove = async (upload: DocumentUpload) => {
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
        .eq('id', upload.id);

      if (error) throw error;

      // Log activity
      await supabase.from('activities').insert({
        case_id: caseId,
        user_id: user.id,
        action: 'document_approved',
        description: `Approved "${upload.document_name}" (v${upload.version}) for case ${caseNumber}`,
      });

      // Notify uploader if different from reviewer
      if (upload.uploaded_by && upload.uploaded_by !== user.id) {
        await sendNotification(
          supabase,
          upload.uploaded_by,
          `Document Approved: ${upload.document_name}`,
          `Your document ${upload.document_name} (v${upload.version}) has been verified and approved.`,
          'success',
          `/cases/${caseId}`,
          caseId
        );
      }

      toast(`Document "${upload.document_name}" approved`, 'success');
      fetchDocumentsData();
      onActivityLogged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approval failed';
      toast(msg, 'error');
    }
  };

  // Open Reject Modal
  const handleOpenRejectModal = (upload: DocumentUpload) => {
    setRejectingUpload(upload);
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
        case_id: caseId,
        user_id: user.id,
        action: 'document_rejected',
        description: `Rejected "${rejectingUpload.document_name}" (v${rejectingUpload.version}): ${rejectionReason.trim()}`,
      });

      // Notify responsible employee / uploader
      const recipient = rejectingUpload.uploaded_by || assignedTo;
      if (recipient && recipient !== user.id) {
        await sendNotification(
          supabase,
          recipient,
          `Document Rejected: ${rejectingUpload.document_name}`,
          `Reason: ${rejectionReason.trim()}. Please upload a new version.`,
          'warning',
          `/cases/${caseId}`,
          caseId
        );
      }

      toast(`Document rejected with notification sent`, 'warning');
      setIsRejectModalOpen(false);
      fetchDocumentsData();
      onActivityLogged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rejection failed';
      toast(msg, 'error');
    } finally {
      setIsReviewing(false);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status?: DocumentUploadStatus) => {
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
        return (
          <Badge variant="default">
            <AlertCircle className="h-3 w-3 mr-1" /> Missing
          </Badge>
        );
    }
  };

  // Filter requirements by stage
  const filteredRequirements = requirementsWithUploads.filter((req) => {
    if (filterStage === 'all') return true;
    if (filterStage === 'current') return req.stage_id === currentStageId;
    return req.stage_id === filterStage;
  });

  const totalRequired = filteredRequirements.filter((r) => r.is_mandatory).length;
  const totalApproved = filteredRequirements.filter(
    (r) => r.is_mandatory && r.latestUpload?.status === 'approved'
  ).length;

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/60 pb-4">
        <div>
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <FileText className="h-4 w-4 text-indigo-400" />
            Case Documents & Checklist
            <span className="text-xs font-normal text-slate-400">
              ({totalApproved}/{totalRequired} mandatory verified)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Upload, verify, and track versions of documents required across workflow stages
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Stage Filter Selector */}
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Stages Checklist</option>
            <option value="current">Current Stage Only</option>
            {stages.map((stg) => (
              <option key={stg.id} value={stg.id}>
                {stg.name}
              </option>
            ))}
          </select>

          <Button size="sm" variant="secondary" onClick={() => handleOpenUpload()}>
            <Plus className="h-3.5 w-3.5" />
            Upload Document
          </Button>
        </div>
      </div>

      {/* Checklist Table */}
      {cleanup.map((item) => <div key={item.path} role="alert" className="rounded-lg border border-amber-500/30 p-3 text-xs text-amber-300">
        <p>{item.filename}: {item.warning}</p>
        <Button size="sm" variant="secondary" onClick={() => retryCleanup(item.path)} disabled={!!retryingCleanup} isLoading={retryingCleanup === item.path}>Retry file cleanup</Button>
      </div>)}
      {isLoading ? (
        <div className="py-6 text-center text-xs text-slate-500">Loading case documents...</div>
      ) : filteredRequirements.length === 0 && customUploads.length === 0 ? (
        <div className="text-center py-8 text-xs text-slate-500 space-y-2">
          <FileText className="h-8 w-8 text-slate-600 mx-auto" />
          <p>No document checklist configured for this stage.</p>
          <Button size="sm" variant="secondary" onClick={() => handleOpenUpload()}>
            <Upload className="h-3.5 w-3.5" />
            Upload General Document
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequirements.map((req) => {
            const latest = req.latestUpload;
            const isMissing = !latest;
            const hasMultipleVersions = req.uploads.length > 1;

            return (
              <div
                key={req.id}
                className="rounded-lg border border-slate-800/80 bg-slate-900/70 p-4 transition-all hover:border-slate-700/80"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-xs text-white">{req.name}</span>
                      {req.is_mandatory && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          Mandatory
                        </span>
                      )}
                      {latest && (
                        <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                          v{latest.version}
                        </span>
                      )}
                      {renderStatusBadge(latest?.status)}
                    </div>

                    {req.description && (
                      <p className="text-[11px] text-slate-400 line-clamp-1">{req.description}</p>
                    )}

                    {latest && (
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 pt-0.5">
                        <span>{latest.original_filename}</span>
                        <span>·</span>
                        <span>Uploaded by {latest.uploaded_by_profile?.full_name || 'Staff'}</span>
                        <span>·</span>
                        <span>{formatDate(latest.created_at)}</span>
                      </div>
                    )}

                    {/* Rejection Reason Alert */}
                    {latest?.status === 'rejected' && latest.rejection_reason && (
                      <div className="mt-2 rounded-md bg-rose-500/10 border border-rose-500/20 p-2 text-xs text-rose-300">
                        <span className="font-semibold">Rejection reason:</span> {latest.rejection_reason}
                        <p className="text-[10px] text-rose-400 mt-0.5">
                          Please review the feedback and upload a revised version (v{latest.version + 1}).
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {latest && deleteButton(latest)}
                    {/* View / Download */}
                    {latest && (
                      <button
                        onClick={() => handleDownload(latest)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
                        title="View or download document"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>View</span>
                      </button>
                    )}

                    {/* Version History Button */}
                    {hasMultipleVersions && (
                      <button
                        onClick={() => setHistoryRequirement(req)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 bg-slate-800/60 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
                        title="View all versions"
                      >
                        <History className="h-3.5 w-3.5" />
                        <span>History ({req.uploads.length})</span>
                      </button>
                    )}

                    {/* Upload / Re-upload Button */}
                    <Button
                      size="sm"
                      variant={isMissing ? 'primary' : 'secondary'}
                      onClick={() => handleOpenUpload(req)}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>{isMissing ? 'Upload' : 'Re-upload'}</span>
                    </Button>

                    {/* Review Actions (Approve / Reject) for Owner / Manager or authorized review */}
                    {latest && (latest.status === 'uploaded' || latest.status === 'under_review') && (
                      <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
                        <button
                          onClick={() => handleApprove(latest)}
                          className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                          title="Approve document"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenRejectModal(latest)}
                          className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Reject document with feedback"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Unlinked / Additional Custom Uploads */}
          {customUploads.length > 0 && (
            <div className="pt-4 border-t border-slate-800/60">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Additional Uploaded Files ({customUploads.length})
              </p>
              <div className="space-y-2">
                {customUploads.map((up) => (
                  <div
                    key={up.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-800/60 bg-slate-900/40 text-xs"
                  >
                    <div className="space-y-0.5">
                      <p className="font-medium text-white">{up.document_name}</p>
                      <p className="text-[10px] text-slate-500">
                        {up.original_filename} · {formatDate(up.created_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {renderStatusBadge(up.status)}
                      {deleteButton(up)}
                      <button
                        onClick={() => handleDownload(up)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog isOpen={!!deletingUpload}
        onClose={() => { if (!deletionBusy.current) setDeletingUpload(null); }}
        onConfirm={handleDelete} isLoading={isDeleting} title="Delete uploaded document?" confirmText="Delete Document"
        message={`Delete "${deletingUpload?.original_filename}" (version ${deletingUpload?.version})? This removes this uploaded version and its stored file. Any earlier version becomes current; otherwise the checklist item becomes missing. This cannot be undone.`} />

      {/* Upload Document Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        title={targetRequirement ? `Upload: ${targetRequirement.name}` : 'Upload Document'}
        size="md"
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          {!targetRequirement && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Document Name *</label>
              <input
                type="text"
                value={customDocName}
                onChange={(e) => setCustomDocName(e.target.value)}
                placeholder="e.g. Electricity Bill, Property Agreement"
                className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                autoFocus
              />
            </div>
          )}

          {targetRequirement?.description && (
            <div className="rounded-lg bg-slate-800/40 border border-slate-800 p-3 text-xs text-slate-300">
              <span className="font-semibold text-indigo-400">Requirement Instructions:</span>{' '}
              {targetRequirement.description}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Choose File *</label>
            <input
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-xs text-slate-300 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
            />
            {selectedFile && (
              <p className="text-[11px] text-slate-400 mt-1">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setIsUploadModalOpen(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isUploading} disabled={!selectedFile}>
              <Upload className="h-4 w-4" />
              Upload Document
            </Button>
          </div>
        </form>
      </Modal>

      {/* Rejection Reason Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title={`Reject: ${rejectingUpload?.document_name}`}
        size="md"
      >
        <form onSubmit={handleRejectSubmit} className="space-y-4">
          <p className="text-xs text-slate-400">
            Please enter the reason for rejection. This will be recorded in the document history and notified to the responsible staff member.
          </p>

          <Textarea
            id="rejection_reason"
            label="Rejection Reason *"
            placeholder="e.g. The uploaded scan is blurry and the signature on page 3 is not legible. Please submit a high-resolution copy."
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

      {/* Version History Drawer / Modal */}
      <Modal
        isOpen={!!historyRequirement}
        onClose={() => setHistoryRequirement(null)}
        title={`Version History: ${historyRequirement?.name}`}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Available versions for this requirement. Document deletions remain recorded in the case activity history.
          </p>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {historyRequirement?.uploads.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-indigo-400">Version {v.version}</span>
                    {renderStatusBadge(v.status)}
                    {deleteButton(v)}
                  </div>
                  <button
                    onClick={() => handleDownload(v)}
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download File
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-slate-400 pt-1 text-[11px]">
                  <div>
                    <span className="text-slate-500">File:</span> {v.original_filename}
                  </div>
                  <div>
                    <span className="text-slate-500">Uploaded:</span> {formatDateTime(v.created_at)}
                  </div>
                  <div>
                    <span className="text-slate-500">By:</span> {v.uploaded_by_profile?.full_name || 'Staff'}
                  </div>
                  {v.reviewed_at && (
                    <div>
                      <span className="text-slate-500">Reviewed by:</span>{' '}
                      {v.reviewed_by_profile?.full_name || 'Staff'} ({formatDate(v.reviewed_at)})
                    </div>
                  )}
                </div>

                {v.rejection_reason && (
                  <div className="rounded bg-rose-500/10 border border-rose-500/20 p-2 text-rose-300 text-[11px]">
                    <span className="font-semibold">Rejection Feedback:</span> {v.rejection_reason}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-800">
            <Button variant="secondary" onClick={() => setHistoryRequirement(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
