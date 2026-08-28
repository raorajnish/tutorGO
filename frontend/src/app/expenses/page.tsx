"use client";

import { useState } from "react";
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
  const [tab, setTab] = useState("ledger");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Expenses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track general and event-based spend, and see it alongside fee income and payroll in one combined ledger.
        </p>
      </div>

      <Tabs tabs={TABS} activeId={tab} onChange={setTab} />

      {tab === "ledger" && <LedgerTab />}
      {tab === "expenses" && <ExpensesTab />}
      {tab === "categories" && <CategoriesTab />}
    </div>
  );
}
