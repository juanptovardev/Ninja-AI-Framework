'use client';

import { useState, useEffect, useRef } from 'react';
import { Badge, Button, PageHeader } from '@ninja/ui-kit';
import { api } from '../../lib/api';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ShieldCheck, XCircle, CheckCircle, ClockCounterClockwise } from '@phosphor-icons/react';

gsap.registerPlugin(useGSAP);

interface ApprovalRequest {
  id: string;
  runId: string;
  agentId: string;
  actionType: string;
  actionSummary: string;
  technicalDetails: string;
  policyId: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  respondedAt?: string;
  responderNotes?: string;
}

const statusColors: Record<string, 'warning' | 'success' | 'danger' | 'default'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  const container = useRef<HTMLDivElement>(null);

  const fetchApprovals = async () => {
    setLoading(true);
    const response = await api.get<ApprovalRequest[]>('/api/approvals');
    if (response.error) {
      setError(new Error(response.error.message));
    } else {
      setApprovals(response.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 5000);
    return () => clearInterval(interval);
  }, []);

  useGSAP(() => {
    if (!loading && approvals.length > 0) {
      gsap.from('.approval-card', {
        y: 30,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power3.out',
        clearProps: 'all'
      });
    }
  }, { dependencies: [loading, approvals.length], scope: container });

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    const response = await api.post<{ success: boolean }>(`/api/approvals/${id}/approve`, {
      notes: 'Approved via Forge Console',
    });
    if (response.error) {
      setError(new Error(response.error.message));
    } else {
      await fetchApprovals();
    }
    setActionLoading(null);
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason) return;

    setActionLoading(id);
    const response = await api.post<{ success: boolean }>(`/api/approvals/${id}/reject`, {
      reason,
    });
    if (response.error) {
      setError(new Error(response.error.message));
    } else {
      await fetchApprovals();
    }
    setActionLoading(null);
  };

  const pendingCount = approvals.filter((a) => a.status === 'pending').length;

  if (loading && approvals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 border-t-2 border-[var(--ninja-accent)] rounded-full animate-spin"></div>
          <div className="absolute inset-2 border-r-2 border-[var(--ninja-text-secondary)] rounded-full animate-spin reverse-spin opacity-50"></div>
        </div>
        <p className="text-[var(--ninja-text-muted)] font-mono-data tracking-widest uppercase">Fetching Approvals...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh]">
        <XCircle weight="duotone" className="w-20 h-20 text-[var(--ninja-danger)] mb-6 opacity-80" />
        <h2 className="text-2xl font-display font-bold text-[var(--ninja-text-primary)] mb-2">Failed to load approvals</h2>
        <p className="text-[var(--ninja-text-secondary)] text-center max-w-md">{error.message}</p>
        <Button variant="secondary" className="mt-8" onClick={fetchApprovals}>Retry Request</Button>
      </div>
    );
  }

  return (
    <div ref={container} className="flex flex-col pb-24">
      <PageHeader 
        title="Approvals" 
        subtitle="Manage agent action requests and security policy overrides."
        badge={
          <Badge variant="warning" pulse={pendingCount > 0}>
            {pendingCount} pending
          </Badge>
        }
      />

      {approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] glass-card border-[var(--ninja-border-subtle)] border-dashed">
          <ShieldCheck weight="duotone" className="w-16 h-16 text-[var(--ninja-text-muted)] mb-4 opacity-50" />
          <p className="text-[var(--ninja-text-secondary)] font-medium">No approval requests found</p>
          <p className="text-sm text-[var(--ninja-text-muted)] mt-1">All agents are operating within autonomous bounds.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {approvals.map((approval) => (
            <div key={approval.id} className="approval-card">
              <div className="glass-card h-full flex flex-col border-[var(--ninja-border-subtle)] hover:border-[var(--ninja-border-strong)] transition-all">
                <div className="p-6 border-b border-[var(--ninja-border-subtle)]">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-display font-bold text-[var(--ninja-text-primary)]">{approval.actionType}</h3>
                      <p className="text-sm text-[var(--ninja-text-secondary)] mt-1 font-light">{approval.actionSummary}</p>
                    </div>
                    <Badge variant={statusColors[approval.status]}>{approval.status.toUpperCase()}</Badge>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs font-mono-data text-[var(--ninja-text-muted)] uppercase tracking-wider">
                    <ClockCounterClockwise className="w-4 h-4" />
                    Requested {formatTime(approval.requestedAt)}
                  </div>
                </div>

                <div className="p-6 flex-1 flex flex-col gap-6">
                  <div>
                    <p className="text-xs font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-3">Technical Details</p>
                    <div className="p-4 bg-[var(--ninja-bg-primary)] rounded-lg border border-[var(--ninja-border-subtle)]">
                      <pre className="text-xs font-mono-data text-[var(--ninja-text-muted)] whitespace-pre-wrap overflow-auto max-h-48 custom-scroll">
                        {approval.technicalDetails}
                      </pre>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-auto pt-6 border-t border-[var(--ninja-border-subtle)]">
                    <div>
                      <p className="text-xs font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-1">Agent ID</p>
                      <p className="text-sm font-mono-data text-[var(--ninja-text-primary)]">{approval.agentId.substring(0, 8)}...</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-1">Run ID</p>
                      <p className="text-sm font-mono-data text-[var(--ninja-text-primary)]">{approval.runId.substring(0, 8)}...</p>
                    </div>
                  </div>

                  {approval.status === 'pending' && (
                    <div className="flex gap-4 mt-2 pt-6 border-t border-[var(--ninja-border-subtle)]">
                      <Button
                        className="flex-1 bg-[var(--ninja-success)] hover:bg-[#059669] text-[var(--ninja-bg-primary)] border-none"
                        onClick={() => handleApprove(approval.id)}
                        disabled={actionLoading !== null}
                      >
                        {actionLoading === approval.id ? 'Processing...' : 'Authorize Action'}
                      </Button>
                      <Button
                        className="flex-1 bg-[var(--ninja-danger)] hover:bg-[#dc2626] text-white border-none"
                        onClick={() => handleReject(approval.id)}
                        disabled={actionLoading !== null}
                      >
                        Reject
                      </Button>
                    </div>
                  )}

                  {approval.status !== 'pending' && approval.responderNotes && (
                    <div className="mt-2 pt-6 border-t border-[var(--ninja-border-subtle)]">
                      <p className="text-xs font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-2">Resolution Notes</p>
                      <div className="p-3 bg-[var(--ninja-bg-secondary)] rounded-md border border-[var(--ninja-border-subtle)] flex items-start gap-3">
                        {approval.status === 'approved' ? (
                          <CheckCircle weight="fill" className="w-5 h-5 text-[var(--ninja-success)] shrink-0 mt-0.5" />
                        ) : (
                          <XCircle weight="fill" className="w-5 h-5 text-[var(--ninja-danger)] shrink-0 mt-0.5" />
                        )}
                        <p className="text-sm text-[var(--ninja-text-primary)] italic">"{approval.responderNotes}"</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
