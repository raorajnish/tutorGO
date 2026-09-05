"use client";

import { Modal } from "@/components/ui/Modal";
import { CopyMessageBox } from "@/components/attendance/CopyMessageBox";
import { useMessageTemplate } from "@/lib/useMessageTemplate";
import { renderTemplate, payrollPaymentRecordedVars } from "@/lib/messageTemplates";
import { useAuth } from "@/lib/auth-context";
import { PAYMENT_MODE_LABELS, type PayrollPayment } from "@/lib/types";

interface Props {
  payment: PayrollPayment | null;
  staffName: string | null;
  pendingAmount: string | null;
  onClose: () => void;
}

/** A copy-to-WhatsApp confirmation for one specific payment transaction —
 * not a payslip. Kept distinct from the real payslip document
 * (PayslipDocument.tsx, which documents a full pay period's earnings): this
 * is the "let them know this payment landed" nudge, useful the moment a
 * payment is recorded, while the payslip is the formal per-period record. */
export function PaymentConfirmationModal({ payment, staffName, pendingAmount, onClose }: Props) {
  const { user } = useAuth();
  const template = useMessageTemplate(payment ? "PAYROLL_PAYMENT_RECORDED" : null);
  const instituteName = user?.institute?.name ?? "TutorGO";

  const message =
    payment && template
      ? renderTemplate(
          template,
          payrollPaymentRecordedVars({
            name: staffName ?? "",
            amount: payment.amount,
            mode: PAYMENT_MODE_LABELS[payment.mode],
            paidOn: payment.paidOn,
            pendingAmount: pendingAmount ?? "0.00",
            instituteName,
          })
        )
      : null;

  return (
    <Modal open={payment !== null} onClose={onClose} title="Payment confirmation" width="sm">
      {!message && <p className="text-sm text-muted-foreground">Loading…</p>}
      {message && <CopyMessageBox message={message} />}
    </Modal>
  );
}
