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

export function PayslipModal({ payment, staffName, pendingAmount, onClose }: Props) {
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
    <Modal open={payment !== null} onClose={onClose} title="Payslip" width="sm">
      {!message && <p className="text-sm text-muted-foreground">Loading…</p>}
      {message && <CopyMessageBox message={message} />}
    </Modal>
  );
}
