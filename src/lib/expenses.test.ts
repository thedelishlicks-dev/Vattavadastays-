/**
 * Unit tests for expenses.ts.
 *   npx tsx --test src/lib/expenses.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  expenseCategoryLabel,
  isExpenseCategory,
  localDateString,
  monthRange,
  sumExpenses,
  totalsByCategory,
  validateExpenseForm,
} from "./expenses";

const valid = {
  amount: "1500",
  category: "electricity",
  expense_date: "2026-11-05",
  description: "",
  payment_method: "",
  notes: "",
};

test("the twelve categories match the database check, each with a label", () => {
  assert.deepEqual([...EXPENSE_CATEGORIES].sort(), [
    "cleaning",
    "electricity",
    "food",
    "internet",
    "maintenance",
    "marketing",
    "ota_commission",
    "other",
    "property_tax",
    "staff",
    "supplies",
    "transport",
  ]);
  for (const c of EXPENSE_CATEGORIES) assert.ok(EXPENSE_CATEGORY_LABELS[c]);
  assert.equal(expenseCategoryLabel("ota_commission"), "OTA commission");
  assert.equal(expenseCategoryLabel("something_new"), "something_new");
  assert.equal(isExpenseCategory("food"), true);
  assert.equal(isExpenseCategory("lunch"), false);
});

test("monthRange gives local first day, next first day and last day", () => {
  assert.deepEqual(monthRange(new Date(2026, 10, 19)), {
    start: "2026-11-01",
    endExclusive: "2026-12-01",
    lastDay: "2026-11-30",
  });
  assert.deepEqual(monthRange(new Date(2026, 11, 31)), {
    start: "2026-12-01",
    endExclusive: "2027-01-01",
    lastDay: "2026-12-31",
  });
  assert.deepEqual(monthRange(new Date(2028, 1, 10)), {
    start: "2028-02-01",
    endExclusive: "2028-03-01",
    lastDay: "2028-02-29",
  });
  assert.equal(localDateString(new Date(2026, 0, 5)), "2026-01-05");
});

test("sumExpenses avoids floating-point noise and handles empty", () => {
  assert.equal(sumExpenses([{ amount: 0.1 }, { amount: 0.2 }]), 0.3);
  assert.equal(sumExpenses([]), 0);
  assert.equal(sumExpenses([{ amount: "250.50" as unknown as number }, { amount: 100 }]), 350.5);
});

test("totalsByCategory groups, counts and sorts biggest first", () => {
  const rows = totalsByCategory([
    { category: "staff", amount: 5000 },
    { category: "food", amount: 300 },
    { category: "staff", amount: 2000 },
    { category: "electricity", amount: 7000 },
  ]);
  assert.deepEqual(
    rows,
    [
      { category: "staff", total: 7000, count: 2 },
      { category: "electricity", total: 7000, count: 1 },
      { category: "food", total: 300, count: 1 },
    ].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category)),
  );
  assert.deepEqual(totalsByCategory([]), []);
});

test("validateExpenseForm mirrors the database rules", () => {
  assert.equal(validateExpenseForm(valid), null);
  assert.ok(validateExpenseForm({ ...valid, amount: "" }));
  assert.ok(validateExpenseForm({ ...valid, amount: "0" }));
  assert.ok(validateExpenseForm({ ...valid, amount: "-5" }));
  assert.ok(validateExpenseForm({ ...valid, amount: "abc" }));
  assert.ok(validateExpenseForm({ ...valid, amount: "10.555" }));
  assert.equal(validateExpenseForm({ ...valid, amount: "10.55" }), null);
  assert.ok(validateExpenseForm({ ...valid, category: "" }));
  assert.ok(validateExpenseForm({ ...valid, category: "lunch" }));
  assert.ok(validateExpenseForm({ ...valid, expense_date: "" }));
});
