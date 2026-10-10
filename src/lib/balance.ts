/**
 * Single source of truth for "what does the guest owe?".
 *
 * Every screen (tracking page, owner booking detail, invoice, WhatsApp
 * reminders, UPI card) must use this instead of hand-rolling
 * `Math.max(0, total + charges - discount - advance)`.
 *
 * Why: that clamp-to-zero hides OVERPAYMENT. If the owner shortens a stay
 * after the guest paid an advance, advance can exceed the new net total —
 * the clamp turned that into "Fully paid ✓" and the owner/guest never saw
 * that money is owed back.
 */
export interface BalanceInput {
  /** Room/stay charge (bookings.total_amount or booking_groups.total_amount). */
  roomTotal: number;
  /** Sum of qty × unit_price of booking_charges. */
  chargesTotal?: number;
  discount?: number;
  advance?: number;
}

export interface BalanceResult {
  /** roomTotal + chargesTotal − discount (never below 0). What the stay now costs. */
  netTotal: number;
  /** Still to collect from the guest (≥ 0). */
  balance: number;
  /** Guest has paid MORE than netTotal — amount to refund / adjust (≥ 0). */
  refundDue: number;
  /** netTotal is covered exactly (balance 0 and no refund). */
  isSettled: boolean;
}

export function computeBalance({ roomTotal, chargesTotal = 0, discount = 0, advance = 0 }: BalanceInput): BalanceResult {
  const netTotal = Math.max(0, roomTotal + chargesTotal - discount);
  const diff = netTotal - advance;
  return {
    netTotal,
    balance: Math.max(0, diff),
    refundDue: Math.max(0, -diff),
    isSettled: diff === 0,
  };
}
