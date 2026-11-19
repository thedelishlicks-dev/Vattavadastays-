import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Receipt } from "lucide-react";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useExpenses, useDeleteExpense } from "@/hooks/useExpenses";
import { ExpenseModal } from "@/components/ExpenseModal";
import { ExpenseList } from "@/components/ExpenseList";
import { LoadFailed } from "@/components/LoadFailed";
import { Button, EmptyState } from "@/components/ds";
import { PageHeader } from "@/admin/formKit";
import { expenseCategoryLabel, monthRange, sumExpenses, totalsByCategory } from "@/lib/expenses";
import { saveFailMessage } from "@/lib/bookingActions";
import type { Expense } from "@/types/database";

export const Route = createFileRoute("/admin/expenses")({
  component: AdminExpenses,
});

// ---------------------------------------------------------------------------
// Expenses — what the property spends, month by month. Deliberately small: a list, a monthly total
// and totals per category. Not accounting (no ledger, tax or reports). The same expenses feed
// src/lib/businessMetrics.ts (estimated operating profit).
// ---------------------------------------------------------------------------

function AdminExpenses() {
  const { data: property, isLoading: propLoading } = useOwnerProperty();
  const [monthOffset, setMonthOffset] = useState(0); // 0 = this month, -1 = last month, ...
  const [modal, setModal] = useState<Expense | "new" | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const deleteExpense = useDeleteExpense();

  const viewed = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  }, [monthOffset]);
  const range = useMemo(() => monthRange(viewed), [viewed]);
  const monthLabel = viewed.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const {
    data: expenses = [],
    isLoading,
    isError,
    refetch,
  } = useExpenses(property?.id ?? "", {
    startDate: range.start,
    endDate: range.lastDay,
  });

  const total = useMemo(() => sumExpenses(expenses), [expenses]);
  const categories = useMemo(() => totalsByCategory(expenses), [expenses]);

  const handleDelete = async (expense: Expense) => {
    if (!property) return;
    const what = `${expenseCategoryLabel(expense.category)} expense of ₹${Number(expense.amount).toLocaleString("en-IN")}`;
    if (!window.confirm(`Delete this ${what}?`)) return;
    setDeletingId(expense.id);
    setActionError("");
    try {
      await deleteExpense.mutateAsync({ id: expense.id, propertyId: property.id });
    } catch (e) {
      setActionError(
        saveFailMessage(e, "Couldn't delete the expense. Please try again — nothing was deleted."),
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (propLoading || isLoading) {
    return <div className="h-48 rounded-xl bg-muted animate-pulse" />;
  }
  // A failed load must not read as "no expenses" / ₹0 (HANDOVER rule 36).
  if (isError) {
    return <LoadFailed title="Couldn't load your expenses" onRetry={() => void refetch()} />;
  }
  if (!property) {
    return <LoadFailed title="Couldn't find your property" />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Expenses" subtitle="What you spend to run the property." />
        <Button className="shrink-0" onClick={() => setModal("new")}>
          <Plus className="h-4 w-4" /> Add expense
        </Button>
      </div>

      <div className="rounded-3xl bg-muted/60 p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMonthOffset((m) => m - 1)}
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-card hover:bg-card/70"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-medium">{monthOffset === 0 ? "This month" : monthLabel}</p>
          <button
            type="button"
            onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
            disabled={monthOffset === 0}
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-card hover:bg-card/70 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold tracking-tight">₹{total.toLocaleString("en-IN")}</p>
          <p className="text-xs text-muted-foreground">
            {monthOffset === 0 ? monthLabel + " · " : ""}
            {expenses.length} expense{expenses.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-base font-semibold">By category</h2>
          <ul className="space-y-1.5">
            {categories.map((c) => (
              <li
                key={c.category}
                className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-2.5 text-sm"
              >
                <span>
                  {expenseCategoryLabel(c.category)}{" "}
                  <span className="text-xs text-muted-foreground">({c.count})</span>
                </span>
                <span className="font-semibold">₹{c.total.toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      {expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={monthOffset === 0 ? "No expenses this month" : `No expenses in ${monthLabel}`}
          hint="Add electricity, staff, supplies and other costs to see what the property really earns."
          action={
            <Button onClick={() => setModal("new")}>
              <Plus className="h-4 w-4" /> Add expense
            </Button>
          }
        />
      ) : (
        <ExpenseList
          expenses={expenses}
          onEdit={(e) => setModal(e)}
          onDelete={handleDelete}
          deletingId={deletingId}
        />
      )}

      {modal && (
        <ExpenseModal
          propertyId={property.id}
          expense={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
