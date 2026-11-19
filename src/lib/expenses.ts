// src/lib/expenses.ts — pure helpers for the Expenses page (no React, no Supabase; tested in expenses.test.ts).
//
// Dates are plain "YYYY-MM-DD" strings built from LOCAL date parts, never toISOString() (UTC is a day
// off in India before 5:30 am — HANDOVER rule 35).

import type { Expense, ExpenseCategory } from "@/types/database";

/** The only categories the database accepts (expenses_category_check). Order = order in the picker. */
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  "electricity",
  "cleaning",
  "staff",
  "maintenance",
  "supplies",
  "food",
  "ota_commission",
  "property_tax",
  "internet",
  "marketing",
  "transport",
  "other",
];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  electricity: "Electricity",
  cleaning: "Cleaning",
  staff: "Staff",
  maintenance: "Maintenance",
  supplies: "Supplies",
  food: "Food",
  ota_commission: "OTA commission",
  property_tax: "Property tax",
  internet: "Internet",
  marketing: "Marketing",
  transport: "Transport",
  other: "Other",
};

/** Free text in the DB; these are the choices the form offers. */
export const EXPENSE_PAYMENT_METHODS = ["Cash", "UPI", "Bank transfer", "Card"] as const;

export function expenseCategoryLabel(category: string): string {
  return EXPENSE_CATEGORY_LABELS[category as ExpenseCategory] ?? category;
}

export function isExpenseCategory(v: unknown): v is ExpenseCategory {
  return typeof v === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(v);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Local "YYYY-MM-DD". */
export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** First day of the month of `now` and the first day of the NEXT month (end is exclusive). */
export function monthRange(now: Date): { start: string; endExclusive: string; lastDay: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: localDateString(start),
    endExclusive: localDateString(next),
    lastDay: localDateString(last),
  };
}

function amountOf(e: Pick<Expense, "amount">): number {
  const n = Number(e.amount);
  return Number.isFinite(n) ? n : 0;
}

/** Sum of amounts, in rupees (rounded to paise to avoid 0.1 + 0.2 noise). */
export function sumExpenses(expenses: readonly Pick<Expense, "amount">[]): number {
  const total = expenses.reduce((s, e) => s + amountOf(e), 0);
  return Math.round(total * 100) / 100;
}

export interface CategoryTotal {
  category: ExpenseCategory;
  total: number;
  count: number;
}

/** Totals per category, biggest first. Categories with no expense are left out. */
export function totalsByCategory(
  expenses: readonly Pick<Expense, "amount" | "category">[],
): CategoryTotal[] {
  const map = new Map<ExpenseCategory, CategoryTotal>();
  for (const e of expenses) {
    const row = map.get(e.category) ?? { category: e.category, total: 0, count: 0 };
    row.total += amountOf(e);
    row.count += 1;
    map.set(e.category, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, total: Math.round(r.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
}

export interface ExpenseFormValues {
  amount: string;
  category: string;
  expense_date: string;
  description: string;
  payment_method: string;
  notes: string;
}

/** Returns an error message for the form, or null when it can be saved. Mirrors the DB checks. */
export function validateExpenseForm(v: ExpenseFormValues): string | null {
  const amount = Number(v.amount);
  if (v.amount.trim() === "" || !Number.isFinite(amount) || amount <= 0)
    return "Enter an amount above ₹0";
  if (Math.round(amount * 100) / 100 !== amount) return "Amount can have at most 2 decimal places";
  if (amount >= 1e10) return "That amount is too large";
  if (!isExpenseCategory(v.category)) return "Choose a category";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.expense_date)) return "Choose the date of the expense";
  return null;
}
