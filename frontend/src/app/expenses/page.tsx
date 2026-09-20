"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";
import { LedgerTab } from "@/components/expenses/LedgerTab";
import { ExpensesTab } from "@/components/expenses/ExpensesTab";
import { CategoriesTab } from "@/components/expenses/CategoriesTab";

const TABS = [
  { id: "ledger", label: "Ledger" },
  { id: "expenses", label: "Expenses" },
  { id: "categories", label: "Categories" },
];

export default function ExpensesPage() {
  return (
    <Suspense fallback={null}>
      <ExpensesContent />
    </Suspense>
  );
}

function ExpensesContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("ledger");
  const [initialAddOpen, setInitialAddOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("open") === "create" || searchParams.get("create") === "true") {
      setTab("expenses");
      setInitialAddOpen(true);
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Expenses</h1>
        <p className="mt-1 text-sm text-muted-foreground hidden sm:block">
          Track general and event-based spend, and see it alongside fee income and payroll in one combined ledger.
        </p>
      </div>

      <Tabs tabs={TABS} activeId={tab} onChange={setTab} />

      {tab === "ledger" && <LedgerTab />}
      {tab === "expenses" && <ExpensesTab key={initialAddOpen ? "add-open" : "normal"} initialAddOpen={initialAddOpen} />}
      {tab === "categories" && <CategoriesTab />}
    </div>
  );
}
