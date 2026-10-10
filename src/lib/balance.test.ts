/**
 * Unit tests for the money rules in balance.ts.
 *
 * Run (no extra dependencies needed):
 *   npx tsx --test src/lib/balance.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeBalance,
  chargesSum,
  advanceAmount,
  fractionOf,
  paymentDueAmount,
} from "./balance";

// ── chargesSum ───────────────────────────────────────────────────────────────
test("chargesSum adds qty × unit_price and handles empty/null", () => {
  assert.equal(chargesSum([{ qty: 1, unit_price: 100 }, { qty: 2, unit_price: 175 }]), 450);
  assert.equal(chargesSum([]), 0);
  assert.equal(chargesSum(null), 0);
  assert.equal(chargesSum(undefined), 0);
});

test("chargesSum treats numeric strings from the database as numbers", () => {
  assert.equal(chargesSum([{ qty: "2" as unknown as number, unit_price: "50.5" as unknown as number }]), 101);
});

// ── computeBalance: normal cases ────────────────────────────────────────────
test("nothing paid yet: balance is the full net total", () => {
  const r = computeBalance({ roomTotal: 2500 });
  assert.deepEqual(r, { netTotal: 2500, balance: 2500, refundDue: 0, isSettled: false, isPaid: false });
});

test("extra charges are added to the total", () => {
  const r = computeBalance({ roomTotal: 2500, chargesTotal: 450 });
  assert.equal(r.netTotal, 2950);
  assert.equal(r.balance, 2950);
});

test("part payment leaves the remaining balance", () => {
  const r = computeBalance({ roomTotal: 2500, chargesTotal: 450, advance: 738 });
  assert.equal(r.balance, 2212);
  assert.equal(r.refundDue, 0);
  assert.equal(r.isPaid, false);
});

test("exactly paid is settled, not overpaid", () => {
  const r = computeBalance({ roomTotal: 2500, chargesTotal: 450, discount: 450, advance: 2500 });
  assert.equal(r.balance, 0);
  assert.equal(r.refundDue, 0);
  assert.equal(r.isSettled, true);
  assert.equal(r.isPaid, true);
});

// ── overpaid ────────────────────────────────────────────────────────────────
test("overpaid after a stay is shortened shows a refund, not 'fully paid'", () => {
  // Real case from the app: 2,500 room + 450 extras − 2,000 discount, advance 1,507
  const r = computeBalance({ roomTotal: 2500, chargesTotal: 450, discount: 2000, advance: 1507 });
  assert.equal(r.netTotal, 950);
  assert.equal(r.balance, 0);
  assert.equal(r.refundDue, 557);
  assert.equal(r.isSettled, false); // overpaid is NOT exactly settled…
  assert.equal(r.isPaid, true); // …but nothing more is owed
});

test("balance and refund are never both positive", () => {
  for (const advance of [0, 100, 950, 951, 5000]) {
    const r = computeBalance({ roomTotal: 1000, discount: 50, advance });
    assert.ok(r.balance === 0 || r.refundDue === 0, `advance ${advance}`);
    assert.ok(r.balance >= 0 && r.refundDue >= 0);
  }
});

// ── discount larger than total ──────────────────────────────────────────────
test("discount larger than room + extras: net total floors at 0 and the advance is all refund", () => {
  const r = computeBalance({ roomTotal: 2500, chargesTotal: 0, discount: 4000, advance: 600 });
  assert.equal(r.netTotal, 0);
  assert.equal(r.balance, 0);
  assert.equal(r.refundDue, 600);
});

test("100% discount with nothing paid is settled", () => {
  const r = computeBalance({ roomTotal: 2500, discount: 2500 });
  assert.equal(r.netTotal, 0);
  assert.equal(r.isSettled, true);
  assert.equal(r.isPaid, true);
});

test("discount can be covered by extras (discount applies to room + extras together)", () => {
  const r = computeBalance({ roomTotal: 2500, chargesTotal: 450, discount: 2700 });
  assert.equal(r.netTotal, 250);
});

// ── bad data ────────────────────────────────────────────────────────────────
test("null / NaN / numeric-string inputs do not produce NaN", () => {
  const r = computeBalance({
    roomTotal: "2500" as unknown as number,
    chargesTotal: undefined,
    discount: null as unknown as number,
    advance: NaN,
  });
  assert.equal(r.netTotal, 2500);
  assert.equal(r.balance, 2500);
});

test("negative discount or advance cannot change the bill", () => {
  const r = computeBalance({ roomTotal: 1000, discount: -500, advance: -200 });
  assert.equal(r.netTotal, 1000);
  assert.equal(r.balance, 1000);
});

// ── 25% advance / next payment ──────────────────────────────────────────────
test("advanceAmount is 25% of the NET total, rounded to a rupee", () => {
  assert.equal(advanceAmount(2950), 738); // 737.5 rounds up
  assert.equal(advanceAmount(950), 238);
  assert.equal(advanceAmount(0), 0);
});

test("25% is taken on room + extras − discount, not on the room alone", () => {
  const { netTotal } = computeBalance({ roomTotal: 2500, chargesTotal: 450 });
  assert.equal(advanceAmount(netTotal), 738);
  assert.notEqual(advanceAmount(netTotal), advanceAmount(2500)); // old bug: 625
});

test("fractionOf supports the 50% chip", () => {
  assert.equal(fractionOf(2950, 0.5), 1475);
});

test("paymentDueAmount: 25% when nothing paid, otherwise the remaining balance", () => {
  assert.equal(paymentDueAmount(2950, 0), 738);
  assert.equal(paymentDueAmount(2950, 738), 2212);
});

test("paymentDueAmount is never negative when overpaid", () => {
  assert.equal(paymentDueAmount(950, 1507), 0);
});
