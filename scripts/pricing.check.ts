// Run: npx tsx scripts/pricing.check.ts
// Confirms priceRoomStay() (now used by guest booking AND owner tools) matches
// the old guest-side formula, and that Fri/Sat weekend nights are right.

import { priceRoomStay } from "../src/lib/quoteBuilder";

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
}

const room = { id: "r1", name: "Mud House", base_price: 3000, extra_guest_price: 500, weekend_multiplier: 1.5, max_guests: 2 };

// 2026-10-07 is a Wednesday. Nights: Wed, Thu, Fri, Sat → 2 weekday + 2 weekend.
let r = priceRoomStay({ room, guests: 2, checkIn: "2026-10-07", checkOut: "2026-10-11" });
eq("4 nights, 2 weekend: room price", r.room_price, 3000 * 2 + 4500 * 2);
eq("weekend nights counted", r.weekend_nights, 2);
eq("no extra guests", r.extra_guest_charge, 0);

// Extra guests: 4 guests, 2 included → 2 × 500 × 4 nights.
r = priceRoomStay({ room, guests: 4, checkIn: "2026-10-07", checkOut: "2026-10-11" });
eq("extra guest charge", r.extra_guest_charge, 2 * 500 * 4);
eq("total = room + extra", r.total, 15000 + 4000);

// Sunday-only stay is a normal night.
r = priceRoomStay({ room, guests: 1, checkIn: "2026-10-11", checkOut: "2026-10-12" });
eq("Sunday night is base price", r.total, 3000);

// Empty / bad dates never produce NaN.
r = priceRoomStay({ room, guests: 1, checkIn: "", checkOut: "" });
eq("empty dates → 0, not NaN", r.total, 0);

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nAll pricing checks passed");
