import { Pencil, Trash2, Loader2 } from "lucide-react";
import { expenseCategoryLabel } from "@/lib/expenses";
import type { Expense } from "@/types/database";

interface ExpenseListProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  /** Id of the expense being deleted (shows a spinner and blocks a second tap). */
  deletingId?: string | null;
}

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function ExpenseList({ expenses, onEdit, onDelete, deletingId }: ExpenseListProps) {
  return (
    <ul className="divide-y divide-border/60 rounded-3xl border border-border/60 bg-card">
      {expenses.map((e) => (
        <li key={e.id} className="flex items-center gap-3 px-4 py-3">
          <span
            aria-hidden="true"
            className="w-12 shrink-0 text-xs font-medium text-muted-foreground"
          >
            {formatDate(e.expense_date)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{expenseCategoryLabel(e.category)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {e.description || "No description"}
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold">
            ₹{Number(e.amount).toLocaleString("en-IN")}
          </p>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onEdit(e)}
              aria-label={`Edit ${expenseCategoryLabel(e.category)} expense of ₹${Number(e.amount).toLocaleString("en-IN")}`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(e)}
              disabled={deletingId === e.id}
              aria-label={`Delete ${expenseCategoryLabel(e.category)} expense of ₹${Number(e.amount).toLocaleString("en-IN")}`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
            >
              {deletingId === e.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
