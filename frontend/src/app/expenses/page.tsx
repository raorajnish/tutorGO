"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { ExportButton } from "@/components/ui/ExportButton";
import { ImportButton } from "@/components/ui/ImportButton";
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
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [importExpensesOpen, setImportExpensesOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("open") === "create" || searchParams.get("create") === "true") {
      setTab("expenses");
      setAddExpenseOpen(true);
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
            <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Expenses</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {tab === "ledger" && (
              <ExportButton path="/expenses/ledger/export.csv" filename="ledger.csv" title="Export ledger as CSV" />
            )}
            {tab === "expenses" && (
              <>
                <ExportButton path="/expenses/export.csv" filename="expenses.csv" title="Export expenses as CSV" />
                <ImportButton title="Bulk import expenses from CSV/Excel" onClick={() => setImportExpensesOpen(true)} />
              </>
            )}
            {tab === "categories" ? (
              <Button onClick={() => setAddCategoryOpen(true)}>Add category</Button>
            ) : (
              <Button onClick={() => setAddExpenseOpen(true)}>Add expense</Button>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground hidden sm:block">
          Track general and event-based spend, and see it alongside fee income and payroll in one combined ledger.
        </p>
      </div>

      <Tabs tabs={TABS} activeId={tab} onChange={setTab} />

      {tab === "ledger" && <LedgerTab />}
      {tab === "expenses" && (
        <ExpensesTab
          addOpen={addExpenseOpen}
          onAddOpenChange={setAddExpenseOpen}
          importOpen={importExpensesOpen}
          onImportOpenChange={setImportExpensesOpen}
        />
      )}
      {tab === "categories" && (
        <CategoriesTab
          addOpen={addCategoryOpen}
          onAddOpenChange={setAddCategoryOpen}
        />
      )}
    </div>
  );
}
