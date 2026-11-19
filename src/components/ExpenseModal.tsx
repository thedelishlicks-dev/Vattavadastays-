import { useState } from "react";
import { Modal, ModalActions, Button, Field, TextInput, fieldCls } from "@/components/ds";
import { useCreateExpense, useUpdateExpense } from "@/hooks/useExpenses";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  expenseCategoryLabel,
  isExpenseCategory,
  localDateString,
  validateExpenseForm,
} from "@/lib/expenses";
import { cn } from "@/lib/utils";
import type { Expense } from "@/types/database";

interface ExpenseModalProps {
  propertyId: string;
  /** null = add a new expense */
  expense: Expense | null;
  onClose: () => void;
  onSaved?: (expense: Expense) => void;
}

export function ExpenseModal({ propertyId, expense, onClose, onSaved }: ExpenseModalProps) {
  const isEdit = !!expense;
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const [form, setForm] = useState({
    amount: expense ? String(expense.amount) : "",
    category: expense?.category ?? "",
    expense_date: expense?.expense_date ?? localDateString(new Date()),
    description: expense?.description ?? "",
    payment_method: expense?.payment_method ?? "",
    notes: expense?.notes ?? "",
  });
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const saving = createExpense.isPending || updateExpense.isPending;

  const handleSave = async () => {
    const problem = validateExpenseForm(form);
    if (problem || !isExpenseCategory(form.category)) {
      setError(problem ?? "Choose a category");
      return;
    }
    setError("");
    const payload = {
      propertyId,
      expense_date: form.expense_date,
      category: form.category,
      amount: Number(form.amount),
      description: form.description,
      payment_method: form.payment_method,
      notes: form.notes,
    };
    try {
      const saved = isEdit
        ? await updateExpense.mutateAsync({ id: expense.id, ...payload })
        : await createExpense.mutateAsync(payload);
      onSaved?.(saved);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't save the expense. Please try again.");
    }
  };

  // A payment method saved earlier that is no longer in the list must still show, not vanish.
  const methods: string[] = [...EXPENSE_PAYMENT_METHODS];
  if (form.payment_method && !methods.includes(form.payment_method))
    methods.push(form.payment_method);

  return (
    <Modal
      title={isEdit ? "Edit expense" : "Add expense"}
      onClose={onClose}
      footer={
        <>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <ModalActions>
            <Button variant="soft" size="lg" onClick={onClose}>
              Cancel
            </Button>
            <Button size="lg" className="flex-1" onClick={handleSave} loading={saving}>
              {isEdit ? "Save changes" : "Add expense"}
            </Button>
          </ModalActions>
        </>
      }
    >
      <Field label="Amount (₹) *">
        <TextInput
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={form.amount}
          onChange={(e) => set("amount", e.target.value)}
          placeholder="0"
          autoFocus
        />
      </Field>

      <div className="space-y-1.5">
        <p id="expense-category-label" className="text-xs font-medium text-muted-foreground">
          Category *
        </p>
        <div
          role="radiogroup"
          aria-labelledby="expense-category-label"
          className="flex flex-wrap gap-2"
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={form.category === c}
              onClick={() => set("category", c)}
              className={cn(
                "rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                form.category === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground/80 hover:bg-muted/70",
              )}
            >
              {expenseCategoryLabel(c)}
            </button>
          ))}
        </div>
      </div>

      <Field label="Date *">
        <TextInput
          type="date"
          value={form.expense_date}
          onChange={(e) => set("expense_date", e.target.value)}
        />
      </Field>

      <Field label="Description">
        <TextInput
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Optional, e.g. KSEB bill"
          maxLength={200}
        />
      </Field>

      <Field label="Payment method">
        <select
          value={form.payment_method}
          onChange={(e) => set("payment_method", e.target.value)}
          className={fieldCls}
        >
          <option value="">Not recorded</option>
          {methods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Notes">
        <textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          placeholder="Optional"
          className={cn(fieldCls, "resize-none")}
        />
      </Field>
    </Modal>
  );
}
