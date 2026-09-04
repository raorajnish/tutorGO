"use client";

import { useMemo, useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { StaffTab } from "@/components/payroll/StaffTab";
import { RunsTab } from "@/components/payroll/RunsTab";
import { MyPayslipsTab } from "@/components/payroll/MyPayslipsTab";
import { LeaveTab } from "@/components/payroll/LeaveTab";
import { MyLeaveTab } from "@/components/payroll/MyLeaveTab";
import { useAuth } from "@/lib/auth-context";

export default function PayrollPage() {
  const { user } = useAuth();
  const canManage = user?.role === "OWNER" || user?.role === "ADMIN" || user?.role === "ACCOUNTANT";
  // Leave approval is an OWNER/ADMIN call, narrower than canManage — an
  // ACCOUNTANT runs payroll day-to-day but reviewing someone's time off isn't
  // an accounting decision.
  const canApproveLeave = user?.role === "OWNER" || user?.role === "ADMIN";

  const tabs = useMemo(
    () => [
      ...(canManage ? [{ id: "staff", label: "Staff" }, { id: "runs", label: "Runs" }] : []),
      { id: "payslips", label: "My payslips" },
      ...(canApproveLeave ? [{ id: "leave", label: "Leave" }] : []),
      { id: "my-leave", label: "My leave" },
    ],
    [canManage, canApproveLeave]
  );

  const [tab, setTab] = useState(canManage ? "staff" : "payslips");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Payroll</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {canManage
            ? "Salary profiles, monthly runs, and per-staff payment ledgers — select lectures or months, pay any amount, the rest carries forward."
            : "Your salary ledger — periods, lectures, and payment status."}
        </p>
      </div>

      <Tabs tabs={tabs} activeId={tab} onChange={setTab} />

      {tab === "staff" && canManage && <StaffTab />}
      {tab === "runs" && canManage && <RunsTab />}
      {tab === "payslips" && <MyPayslipsTab />}
      {tab === "leave" && canApproveLeave && <LeaveTab />}
      {tab === "my-leave" && <MyLeaveTab />}
    </div>
  );
}
