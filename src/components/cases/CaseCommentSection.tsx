'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import { getInitials, formatDateTime } from '@/lib/utils';
import type { CaseComment } from '@/types';
import { MessageSquare, Send, User } from 'lucide-react';

interface CaseCommentSectionProps {
  caseId: string;
  caseNumber: string;
  customerId?: string | null;
  onCommentAdded?: () => void;
}

export default function CaseCommentSection({
  caseId,
  caseNumber,
  customerId,
  onCommentAdded,
}: CaseCommentSectionProps) {
  const supabase = createClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const [comments, setComments] = useState<CaseComment[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('case_comments')
        .select(`
          *,
          user:profiles(id, full_name, email, avatar_url)
        `)
        .eq('case_id', caseId)
        .order('created_at', { ascending: true });

      if (error) {
        if (error.code === 'PGRST205' || error.message.includes('does not exist')) {
          setComments([]);
          return;
        }
        throw error;
      }
      setComments((data ?? []) as CaseComment[]);
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, caseId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    setIsSubmitting(true);
    try {
      const commentText = newMessage.trim();

      // 1. Insert comment
      const { error: commentErr } = await supabase.from('case_comments').insert({
        case_id: caseId,
        user_id: user.id,
        message: commentText,
      });

      if (commentErr) throw commentErr;

      // 2. Also log to activity history so timeline reflects everything
      await supabase.from('activities').insert({
        case_id: caseId,
        customer_id: customerId || null,
        user_id: user.id,
        action: 'comment_added',
        description: `Added comment on ${caseNumber}: "${commentText.slice(0, 60)}${commentText.length > 60 ? '...' : ''}"`,
      });

      setNewMessage('');
      toast('Comment posted', 'success');
      await fetchComments();
      onCommentAdded?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to post comment';
      toast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-6 space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-800/60 pb-3 text-white font-semibold text-sm">
        <MessageSquare className="h-4 w-4 text-indigo-400" />
        Case Comments & Discussion ({comments.length})
      </div>

      {/* Comments List */}
      <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
        {isLoading ? (
          <p className="text-xs text-slate-500 py-3 text-center">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            No comments yet. Share operational updates, call notes, or instructions below.
          </p>
        ) : (
          comments.map((comm) => (
            <div key={comm.id} className="flex items-start gap-3 text-xs">
              <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300 shrink-0 text-[11px]">
                {comm.user ? getInitials(comm.user.full_name) : <User className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1 rounded-lg border border-slate-800/80 bg-slate-950/40 p-3 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-white">
                    {comm.user?.full_name || 'Staff Member'}
                  </span>
                  <span className="text-slate-500">{formatDateTime(comm.created_at)}</span>
                </div>
                <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{comm.message}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Comment Form */}
      <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-slate-800/60">
        <Textarea
          id="case_new_comment"
          label=""
          placeholder="Add a comment or internal note regarding this case..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          rows={2}
        />
        <div className="flex justify-end">
          <Button size="sm" type="submit" isLoading={isSubmitting} disabled={!newMessage.trim()}>
            <Send className="h-3.5 w-3.5" />
            Post Comment
          </Button>
        </div>
      </form>
    </div>
  );
}
