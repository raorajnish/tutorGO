"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ActivityTimeline } from "@/components/enquiries/ActivityTimeline";
import { ENQUIRY_SOURCE_LABELS, ENQUIRY_STATUS_LABELS, type Enquiry, type EnquirySource, type EnquiryStatus } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";

const STATUS_TONE: Record<EnquiryStatus, "primary" | "accent" | "success" | "danger"> = {
  NEW: "primary",
  CONTACTED: "accent",
  CONVERTED: "success",
  LOST: "danger",
};

interface EnquiryDetailModalProps {
  enquiry: Enquiry | null;
  open: boolean;
  onClose: () => void;
  onEdit: (enquiry: Enquiry) => void;
  onContact: (enquiry: Enquiry) => void;
  onLost: (enquiry: Enquiry) => void;
  onConvert: (enquiry: Enquiry) => void;
}

export function EnquiryDetailModal({
  enquiry,
  open,
  onClose,
  onEdit,
  onContact,
  onLost,
  onConvert,
}: EnquiryDetailModalProps) {
  const [activeEnquiry, setActiveEnquiry] = useState<Enquiry | null>(enquiry);

  useEffect(() => {
    if (enquiry) setActiveEnquiry(enquiry);
  }, [enquiry]);

  if (!activeEnquiry) return null;
  const displayEnquiry = activeEnquiry;
  const sourceKey = displayEnquiry.source as EnquirySource;
  const statusKey = displayEnquiry.status as EnquiryStatus;
  const canConvert = statusKey === "NEW" || statusKey === "CONTACTED";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-display text-lg font-semibold text-foreground">{displayEnquiry.name}</span>
          {canConvert && (
            <button
              type="button"
              onClick={() => {
                onLost(displayEnquiry);
              }}
              className="inline-flex items-center rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/10 hover:border-danger/50"
            >
              Mark lost
            </button>
          )}
        </div>
      }
      width="lg"
      footer={
        <div className="flex flex-col w-full gap-2">
          <div className="flex items-center gap-2 w-full">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                onEdit(displayEnquiry);
              }}
            >
              Edit lead
            </Button>
            {canConvert && (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  onContact(displayEnquiry);
                }}
              >
                Log contact
              </Button>
            )}
          </div>
          {canConvert && (
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                onClose();
                onConvert(displayEnquiry);
              }}
            >
              Convert to admission
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Basic Information Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Phone Number</p>
            <p className="mt-1 font-medium text-foreground text-sm">{displayEnquiry.phone || "—"}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Course Interested</p>
            <p className="mt-1 font-medium text-foreground text-sm">
              {displayEnquiry.course ? `${displayEnquiry.course.name} (${displayEnquiry.course.code})` : "Institute-wide"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Lead Source</p>
            <p className="mt-1 font-medium text-foreground text-sm">{ENQUIRY_SOURCE_LABELS[sourceKey] ?? sourceKey}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="mt-1">
              <Badge tone={STATUS_TONE[statusKey] ?? "primary"}>{ENQUIRY_STATUS_LABELS[statusKey] ?? statusKey}</Badge>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Next Follow-Up</p>
            <p className="mt-1 font-medium text-foreground text-sm">
              {displayEnquiry.nextFollowUpDate ? fmtDate(displayEnquiry.nextFollowUpDate) : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Created On</p>
            <p className="mt-1 font-medium text-foreground text-sm">{fmtDate(displayEnquiry.createdAt)}</p>
          </div>
        </div>

        {displayEnquiry.notes && (
          <div className="rounded-xl border border-border bg-muted/40 p-3.5 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{displayEnquiry.notes}</p>
          </div>
        )}

        {/* Activity & Follow-Up History */}
        <div className="space-y-3 pt-2 border-t border-border">
          <h4 className="font-semibold text-foreground text-sm">Follow-up Activity History</h4>
          <ActivityTimeline enquiryId={displayEnquiry.id} />
        </div>
      </div>
    </Modal>
  );
}
