// Run from the repo root:  npx tsx scripts/calendarState.check.ts
// Logic checks for the owner Calendar (src/lib/calendarState.ts). No test runner needed.
import { buildCalendarIndex, stateOf, summarizeDate, nightsOf } from "../src/lib/calendarState";
let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`)); };

const rooms = [{ id: "A", name: "Misty Ridge" }, { id: "B", name: "Spice Suite" }];
// The DB marks every booked night unavailable (guest AND owner bookings), here Oct 5,6 for room A
const book = (room: string, ci: string, co: string, status = "confirmed", name = "Ravi Nair") => ({ room_id: room, status, guest_name: name, check_in: ci, check_out: co });
const av = (room: string, ...dates: string[]) => dates.map((d) => ({ room_id: room, date: d }));

// 1. Booking made from the guest site or the dashboard: nights show BOOKED, never closed
let idx = buildCalendarIndex([book("A", "2026-10-05", "2026-10-07")], av("A", "2026-10-05", "2026-10-06"));
eq("booked night 1", stateOf(idx, "A", "2026-10-05"), { state: "booked", name: "Ravi Nair" });
eq("booked night 2", stateOf(idx, "A", "2026-10-06"), { state: "booked", name: "Ravi Nair" });
eq("check-out day free -> open w/ hint", stateOf(idx, "A", "2026-10-07"), { state: "open", name: "Ravi Nair" });
eq("other room unaffected", stateOf(idx, "B", "2026-10-05"), { state: "open", name: undefined });

// 2. Same, but DB trigger also flagged the CHECK-OUT day unavailable: must NOT read as a manual block
idx = buildCalendarIndex([book("A", "2026-10-05", "2026-10-07")], av("A", "2026-10-05", "2026-10-06", "2026-10-07"));
eq("check-out day flagged unavailable -> checkout (not blocked)", stateOf(idx, "A", "2026-10-07"), { state: "checkout", name: "Ravi Nair" });

// 3. Manual block with no booking -> blocked
idx = buildCalendarIndex([], av("A", "2026-10-12"));
eq("manual block", stateOf(idx, "A", "2026-10-12"), { state: "blocked" });

// 4. Pending guest request shows pending; pending never hides confirmed
idx = buildCalendarIndex([book("A", "2026-10-20", "2026-10-22", "pending", "Priya")], av("A", "2026-10-20", "2026-10-21"));
eq("pending", stateOf(idx, "A", "2026-10-20"), { state: "pending", name: "Priya" });
idx = buildCalendarIndex([book("A", "2026-10-20", "2026-10-22", "confirmed", "Ravi"), book("A", "2026-10-20", "2026-10-22", "pending", "Priya")], []);
eq("pending does not hide confirmed", stateOf(idx, "A", "2026-10-20").state, "booked");

// 5. Cancelled booking occupies nothing
idx = buildCalendarIndex([book("A", "2026-10-05", "2026-10-07", "cancelled")], []);
eq("cancelled -> open", stateOf(idx, "A", "2026-10-05").state, "open");

// 6. ALL ROOMS FULL -> "Full" (not closed/blocked)
idx = buildCalendarIndex([book("A", "2026-10-05", "2026-10-07"), book("B", "2026-10-05", "2026-10-08", "confirmed", "Anoop")], av("A", "2026-10-05", "2026-10-06").concat(av("B", "2026-10-05", "2026-10-06", "2026-10-07")));
eq("all rooms booked -> full", summarizeDate(idx, rooms, "2026-10-05").kind, "full");
eq("one room freed -> some-free", summarizeDate(idx, rooms, "2026-10-07").kind, "some-free");
eq("nothing -> open", summarizeDate(idx, rooms, "2026-10-15").kind, "open");

// 7. All rooms blocked by owner -> "blocked"; mix of booked + blocked -> "full"
idx = buildCalendarIndex([], av("A", "2026-10-30").concat(av("B", "2026-10-30")));
eq("all blocked", summarizeDate(idx, rooms, "2026-10-30").kind, "blocked");
idx = buildCalendarIndex([book("A", "2026-10-30", "2026-10-31")], av("A", "2026-10-30").concat(av("B", "2026-10-30")));
eq("booked + blocked -> full", summarizeDate(idx, rooms, "2026-10-30").kind, "full");

// 8. nights math: month boundary, leap day, single night
eq("month boundary", nightsOf("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01"]);
eq("leap day", nightsOf("2028-02-28", "2028-03-01"), ["2028-02-28", "2028-02-29"]);
eq("1 night", nightsOf("2026-10-05", "2026-10-06"), ["2026-10-05"]);
eq("0 nights", nightsOf("2026-10-05", "2026-10-05"), []);
eq("timestamp inputs ok", nightsOf("2026-10-05T00:00:00+00:00", "2026-10-07T00:00:00+00:00"), ["2026-10-05", "2026-10-06"]);

// 9. India timezone: results must not depend on the machine's timezone
for (const tz of ["Asia/Kolkata", "UTC", "America/Los_Angeles"]) {
  process.env.TZ = tz;
  eq("nights stable in TZ " + tz, nightsOf("2026-10-30", "2026-11-02").join(), "2026-10-30,2026-10-31,2026-11-01");
}

// 10. YOUR SCENARIO: block ONE room's date via the Block modal, view All rooms
idx = buildCalendarIndex([], av("A", "2026-10-12"));
let sum = summarizeDate(idx, rooms, "2026-10-12");
eq("one room blocked, one free -> some-free", sum.kind, "some-free");
eq("  counts: 1 free, 1 blocked, 0 booked", [sum.free, sum.blocked, sum.booked], [1, 1, 0]);
eq("  per-room detail names the blocked room", sum.rooms.map((r) => `${r.name}:${r.state}`), ["Misty Ridge:blocked", "Spice Suite:open"]);
idx = buildCalendarIndex([book("B", "2026-10-12", "2026-10-13", "confirmed", "Anoop")], av("B", "2026-10-12").concat(av("A", "2026-10-12")));
sum = summarizeDate(idx, rooms, "2026-10-12");
eq("one booked + one blocked -> full", sum.kind, "full");
eq("  counts: 1 booked, 1 blocked", [sum.booked, sum.blocked], [1, 1]);
eq("  guest shown for booked room", sum.rooms.find((r) => r.id === "B")?.guest, "Anoop");
eq("  no guest on blocked room", sum.rooms.find((r) => r.id === "A")?.guest, undefined);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
