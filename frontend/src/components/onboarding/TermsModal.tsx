import { Modal } from "@/components/ui/Modal";

export function TermsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Terms & Conditions" width="lg">
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          This workspace is provided by TutorGO for managing your institute&apos;s admissions,
          academics, attendance, fees, staff and related records (&quot;the Service&quot;).
        </p>
        <div>
          <h4 className="mb-1 font-medium text-foreground">1. Data ownership</h4>
          <p>
            All student, staff and financial records you enter belong to your institute. TutorGO
            stores this data in an isolated workspace and does not share it with other institutes
            on the platform.
          </p>
        </div>
        <div>
          <h4 className="mb-1 font-medium text-foreground">2. Account responsibility</h4>
          <p>
            You are responsible for the accuracy of the information entered and for keeping staff
            and student login credentials confidential.
          </p>
        </div>
        <div>
          <h4 className="mb-1 font-medium text-foreground">3. Module access</h4>
          <p>
            Access to individual modules (Enquiries, Admissions, Attendance, Fees, Payroll,
            Expenses) depends on your institute&apos;s active subscription and may change if your
            plan changes.
          </p>
        </div>
        <div>
          <h4 className="mb-1 font-medium text-foreground">4. Acceptable use</h4>
          <p>
            The Service may only be used for legitimate institute administration. Do not use it
            to store or process data you are not authorized to hold.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          This is a placeholder terms summary for the current development build and will be
          replaced with a reviewed legal document before production launch.
        </p>
      </div>
    </Modal>
  );
}
