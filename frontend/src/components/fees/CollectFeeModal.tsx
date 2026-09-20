"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { InstallmentList } from "@/components/fees/InstallmentList";
import { SetupFeeAccountModal } from "@/components/fees/SetupFeeAccountModal";
import { ReceiptModal } from "@/components/fees/ReceiptModal";
import { formatMoney, parseMoney } from "@/lib/money";
import { todayInput } from "@/lib/format";
import {
  PAYMENT_MODES,
  PAYMENT_MODE_LABELS,
  type FeeAccountResponse,
  type PaymentMode,
  type StudentListItem,
  type StudentsResponse,
} from "@/lib/types";

import { haptic } from "@/lib/haptics";
import { clearQuickActionQuery } from "@/lib/urlClean";

interface Props {
  open: boolean;
  onClose: () => void;
  initialStudentId?: string | null;
}

export function CollectFeeModal({ open, onClose, initialStudentId }: Props) {
  const handleClose = () => {
    clearQuickActionQuery();
    onClose();
  };
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchList, setSearchList] = useState<StudentListItem[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentListItem | null>(null);

  const [accountData, setAccountData] = useState<FeeAccountResponse | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("UPI");
  const [paidOn, setPaidOn] = useState(todayInput());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  // Search students debounced
  useEffect(() => {
    if (!search.trim()) {
      setSearchList([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      apiFetch<StudentsResponse>(`/students?search=${encodeURIComponent(search.trim())}&status=active`)
        .then((res) => setSearchList(res.students ?? []))
        .catch(() => setSearchList([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  // Load account data when selectedStudent changes
  useEffect(() => {
    if (!selectedStudent) {
      setAccountData(null);
      return;
    }
    setLoadingAccount(true);
    setError(null);
    apiFetch<FeeAccountResponse>(`/fees/accounts/${selectedStudent.id}`)
      .then((res) => {
        setAccountData(res);
        if (res.account) {
          const remaining = parseMoney(res.account.balance);
          // Default amount to next due installment or remaining
          const nextInstallment = res.account.installments.find((i) => i.status === "PENDING" || i.status === "PARTIAL");
          if (nextInstallment) {
            setAmount(String(parseMoney(nextInstallment.amount)));
          } else if (remaining > 0) {
            setAmount(String(remaining));
          } else {
            setAmount("");
          }
        }
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : "Could not load student fee account.");
      })
      .finally(() => setLoadingAccount(false));
  }, [selectedStudent]);

  // Initial student pre-selection if initialStudentId is passed
  useEffect(() => {
    if (!open) {
      setSelectedStudent(null);
      setAccountData(null);
      setSearch("");
      setAmount("");
      setNotes("");
      setError(null);
      setReceiptId(null);
      return;
    }
    if (initialStudentId) {
      apiFetch<{ student: StudentListItem }>(`/students/${initialStudentId}`)
        .then((res) => setSelectedStudent(res.student))
        .catch(() => {});
    }
  }, [open, initialStudentId]);

  const account = accountData?.account;
  const remainingNum = account ? parseMoney(account.balance) : 0;
  const amountError =
    amount !== "" && Number(amount) > remainingNum
      ? `Amount exceeds remaining balance of ${formatMoney(remainingNum)}`
      : undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedStudent || !account) return;
    setError(null);

    if (!amount || Number(amount) <= 0) {
      haptic.warning();
      setError("Please enter a valid payment amount.");
      return;
    }
    if (amountError) {
      haptic.warning();
      setError(amountError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ receiptId?: string }>("/fees/payments", {
        method: "POST",
        body: JSON.stringify({
          studentId: selectedStudent.id,
          amount: Number(amount),
          mode,
          paidOn,
          notes: notes || undefined,
        }),
      });

      // Trigger success double pulse
      haptic.success();

      // Reload account details to reflect new balance & receipt
      const updatedAccount = await apiFetch<FeeAccountResponse>(`/fees/accounts/${selectedStudent.id}`);
      setAccountData(updatedAccount);
      setAmount("");
      setNotes("");

      if (res.receiptId) {
        setReceiptId(res.receiptId);
      }
    } catch (err) {
      haptic.warning();
      setError(err instanceof ApiClientError ? err.message : "Failed to record payment.");
    } finally {
      setSubmitting(false);
    }
  }

  const modeOptions = PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }));

  return (
    <>
      <Modal open={open} onClose={handleClose} title="Collect Fee Payment" width="xl">
        <div className="space-y-6 pb-4">
          {/* Step 1: Student Search / Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Select Student
            </label>

            {!selectedStudent ? (
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search student by name, code, or phone number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                {searching && (
                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">Searching...</span>
                )}

                {/* Autocomplete Results Dropdown */}
                {searchList.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-border/80 bg-card p-1.5 shadow-2xl backdrop-blur-xl">
                    {searchList.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          haptic.tap();
                          setSelectedStudent(st);
                          setSearch("");
                          setSearchList([]);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary focus:bg-secondary focus:outline-none"
                      >
                        <div>
                          <p className="font-semibold text-foreground">{st.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {st.course.name}
                            {st.currentBatch ? ` · ${st.currentBatch.name}` : ""}
                            {st.studentCode ? ` · Code: ${st.studentCode}` : ""}
                          </p>
                        </div>
                        {st.phone && <Badge tone="neutral">{st.phone}</Badge>}
                      </button>
                    ))}
                  </div>
                )}

                {search.trim() !== "" && searchList.length === 0 && !searching && (
                  <p className="mt-1 text-xs text-muted-foreground">No active students match &quot;{search}&quot;.</p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
                    {selectedStudent.name[0]}
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-foreground">{selectedStudent.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {selectedStudent.course.name}
                      {selectedStudent.currentBatch ? ` · ${selectedStudent.currentBatch.name}` : ""}
                      {selectedStudent.studentCode ? ` · Code: ${selectedStudent.studentCode}` : ""}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" onClick={() => setSelectedStudent(null)} className="px-3 py-1.5 text-xs">
                  Change Student
                </Button>
              </div>
            )}
          </div>

          {/* SKELETON PREVIEW LAYOUT (When no student is selected yet) */}
          {!selectedStudent && (
            <div className="space-y-6 opacity-60 pointer-events-none select-none">
              {/* Skeleton Fee Overview Stats */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Total Plan Fee</p>
                  <div className="h-6 w-28 rounded bg-muted-foreground/20 animate-pulse" />
                </div>
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Total Paid</p>
                  <div className="h-6 w-28 rounded bg-muted-foreground/20 animate-pulse" />
                </div>
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Remaining Balance</p>
                  <div className="h-6 w-28 rounded bg-muted-foreground/20 animate-pulse" />
                </div>
              </div>

              {/* Skeleton Record Payment Form */}
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
                <h4 className="font-display text-base font-semibold text-foreground opacity-50">Record Payment</h4>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="h-3 w-20 rounded bg-muted-foreground/20" />
                    <div className="h-10 w-full rounded-xl border border-border bg-muted/30" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-3 w-24 rounded bg-muted-foreground/20" />
                    <div className="h-10 w-full rounded-xl border border-border bg-muted/30" />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="h-3 w-24 rounded bg-muted-foreground/20" />
                    <div className="h-10 w-full rounded-xl border border-border bg-muted/30" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-3 w-28 rounded bg-muted-foreground/20" />
                    <div className="h-10 w-full rounded-xl border border-border bg-muted/30" />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <div className="h-10 w-52 rounded-xl bg-primary/30" />
                </div>
              </div>

              {/* Skeleton Installment History */}
              <div className="space-y-3 pt-2">
                <h4 className="font-display text-base font-semibold text-foreground opacity-50">
                  Installments &amp; Payment History
                </h4>
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="h-4 w-32 rounded bg-muted-foreground/20 animate-pulse" />
                    <div className="h-5 w-16 rounded-full bg-muted-foreground/20 animate-pulse" />
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="h-4 w-40 rounded bg-muted-foreground/20 animate-pulse" />
                    <div className="h-5 w-16 rounded-full bg-muted-foreground/20 animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading / Error state */}
          {loadingAccount && (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading student fee account details...</div>
          )}
          {error && (
            <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          {/* Account Not Set Up */}
          {accountData && !account && selectedStudent && (
            <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                This student does not have a fee account set up yet.
              </p>
              <Button onClick={() => setSetupOpen(true)}>Set up Fee Account</Button>
            </div>
          )}

          {/* Step 2 & 3: Real Fee Overview Stats + Payment Form (When student selected) */}
          {selectedStudent && account && (
            <div className="space-y-6">
              {/* Fee Stats Overview */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-3.5">
                  <p className="text-xs font-medium text-muted-foreground">Total Plan Fee</p>
                  <p className="mt-1 text-lg font-bold text-foreground tabular-nums">
                    {formatMoney(parseMoney(account.totalDue))}
                  </p>
                </div>
                <div className="rounded-xl border border-success/30 bg-success-soft p-3.5">
                  <p className="text-xs font-medium text-success">Total Paid</p>
                  <p className="mt-1 text-lg font-bold text-success tabular-nums">
                    {formatMoney(parseMoney(account.totalPaid))}
                  </p>
                </div>
                <div className="rounded-xl border border-accent/30 bg-accent/10 p-3.5">
                  <p className="text-xs font-medium text-accent">Remaining Balance</p>
                  <p className="mt-1 text-lg font-bold text-accent tabular-nums">
                    {formatMoney(remainingNum)}
                  </p>
                </div>
              </div>

              {/* Record Payment Form */}
              {remainingNum > 0 ? (
                <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
                  <h4 className="font-display text-base font-semibold text-foreground">Record Payment</h4>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Input
                        label="Amount (₹)"
                        type="number"
                        step="any"
                        min="1"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        error={amountError}
                        required
                      />
                      {remainingNum > 0 && (
                        <div className="mt-1.5 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setAmount(String(remainingNum))}
                            className="text-[11px] font-medium text-primary hover:underline"
                          >
                            Full balance ({formatMoney(remainingNum)})
                          </button>
                        </div>
                      )}
                    </div>

                    <div>
                      <Dropdown
                        label="Payment Mode"
                        value={mode}
                        onChange={(val) => setMode(val as PaymentMode)}
                        options={modeOptions}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      label="Payment Date"
                      type="date"
                      value={paidOn}
                      onChange={(e) => setPaidOn(e.target.value)}
                      required
                    />
                    <Textarea
                      label="Notes / Ref ID (Optional)"
                      placeholder="Transaction reference ID or remarks"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={1}
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={submitting || !!amountError || !amount}>
                      {submitting ? "Recording..." : "Record Payment & Issue Receipt"}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="rounded-xl border border-success/30 bg-success-soft p-4 text-center text-sm font-medium text-success">
                  ✓ Fee account fully paid up! No outstanding balance.
                </div>
              )}

              {/* Installment History & Breakdown */}
              <div className="space-y-3 pt-2">
                <h4 className="font-display text-base font-semibold text-foreground">
                  Installments &amp; Payment History
                </h4>
                <InstallmentList
                  studentId={selectedStudent.id}
                  installments={account.installments}
                  canWaive={false}
                  canEditPlan={false}
                  onChanged={() => {
                    apiFetch<FeeAccountResponse>(`/fees/accounts/${selectedStudent.id}`).then(setAccountData);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Nested Modals */}
      {selectedStudent && (
        <SetupFeeAccountModal
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          onSaved={() => {
            setSetupOpen(false);
            apiFetch<FeeAccountResponse>(`/fees/accounts/${selectedStudent.id}`).then(setAccountData);
          }}
          student={
            accountData?.student ?? {
              id: selectedStudent.id,
              name: selectedStudent.name,
              studentCode: selectedStudent.studentCode,
              course: selectedStudent.course,
            }
          }
        />
      )}

      {receiptId && (
        <ReceiptModal paymentId={receiptId} onClose={() => setReceiptId(null)} />
      )}
    </>
  );
}
