/**
 * Single source of truth for every money calculation on a booking.
 *
 * Every screen (tracking page, owner booking card, invoice, Payments ledger,
 * dashboard, WhatsApp reminders, UPI card, payment forms) must use these
 * helpers instead of hand-rolling `total + extras - discount - advance`.
 *
 * Why this exists:
 *  - The same formula used to be copied into ~10 places and drifted apart.
 *  - `Math.max(0, …)` on its own hides OVERPAYMENT. If a stay is shortened
 *    after an advance was paid, the advance can exceed the new net total; the
 *    clamp turned that into "Fully paid ✓" and the refund was invisible.
 *
 * Pure functions only (no React, no Supabase) so they are unit-tested in
 * balance.test.ts.
 */

/** Share of the total asked up-front to confirm a booking. */
export const ADVANCE_FRACTION = 0.25;

export interface ChargeLike {
  qty: number;
  unit_price: number;
}

/** Coerce DB values (numeric strings, null, undefined, NaN) to a safe number. */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Sum of qty × unit_price for a booking's extra charges. */
export function chargesSum(charges?: readonly ChargeLike[] | null): number {
  return (charges ?? []).reduce((s, c) => s + num(c.qty) * num(c.unit_price), 0);
}

export interface BalanceInput {
  /** Room/stay charge (bookings.total_amount or booking_groups.total_amount). */
  roomTotal: number;
  /** Sum of qty × unit_price of booking_charges. */
  chargesTotal?: number;
  discount?: number;
  advance?: number;
}

export interface BalanceResult {
  /** roomTotal + chargesTotal − discount, never below 0. What the stay now costs. */
  netTotal: number;
  /** Still to collect from the guest (≥ 0). */
  balance: number;
  /** Guest has paid MORE than netTotal — amount to refund / adjust (≥ 0). */
  refundDue: number;
  /** Guest has paid exactly netTotal. */
  isSettled: boolean;
  /** Nothing more to collect (settled OR overpaid). Use for the "paid" flag. */
  isPaid: boolean;
}

export function computeBalance({ roomTotal, chargesTotal = 0, discount = 0, advance = 0 }: BalanceInput): BalanceResult {
  // A negative discount/advance is bad data; never let it inflate or shrink the bill.
  const netTotal = Math.max(0, num(roomTotal) + num(chargesTotal) - Math.max(0, num(discount)));
  const diff = netTotal - Math.max(0, num(advance));
  return {
    netTotal,
    balance: Math.max(0, diff),
    refundDue: Math.max(0, -diff),
    isSettled: diff === 0,
    isPaid: diff <= 0,
  };
}

/** A fraction of the total, rounded to a whole rupee (used for 25% / 50% chips). */
export function fractionOf(netTotal: number, fraction: number): number {
  return Math.round(num(netTotal) * fraction);
}

/** The 25% advance asked to confirm a booking, on the NET total (extras in, discount out). */
export function advanceAmount(netTotal: number): number {
  return fractionOf(netTotal, ADVANCE_FRACTION);
}

/**
 * What to ask the guest to pay next: 25% advance if nothing is paid yet,
 * otherwise whatever is left. Never negative.
 */
export function paymentDueAmount(netTotal: number, advancePaid: number): number {
  if (num(advancePaid) === 0) return advanceAmount(netTotal);
  return Math.max(0, num(netTotal) - num(advancePaid));
}
