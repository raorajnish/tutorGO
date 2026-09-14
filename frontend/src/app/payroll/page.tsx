"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/auth-context";

const StaffTab = dynamic(
  () => import("@/components/payroll/StaffTab").then((m) => m.StaffTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const RunsTab = dynamic(
  () => import("@/components/payroll/RunsTab").then((m) => m.RunsTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const MyPayslipsTab = dynamic(
  () => import("@/components/payroll/MyPayslipsTab").then((m) => m.MyPayslipsTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const LeaveTab = dynamic(
  () => import("@/components/payroll/LeaveTab").then((m) => m.LeaveTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const MyLeaveTab = dynamic(
  () => import("@/components/payroll/MyLeaveTab").then((m) => m.MyLeaveTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);

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
