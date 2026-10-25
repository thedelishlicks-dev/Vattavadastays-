// Run from the repo root:  npx tsx scripts/calendarState.check.ts
// Logic checks for the owner Calendar (src/lib/calendarState.ts). No test runner needed.
import { buildCalendarIndex, stateOf, summarizeDate, nightsOf, bookingForCell } from "../src/lib/calendarState";
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

// 11. GUEST BOOKING AWAITING CONFIRMATION must read as PENDING in the All-rooms summary (not "booked")
idx = buildCalendarIndex([book("A", "2026-10-14", "2026-10-16", "pending", "Guest from website")], av("A", "2026-10-14", "2026-10-15"));
sum = summarizeDate(idx, rooms, "2026-10-14");
eq("pending guest booking: some-free", sum.kind, "some-free");
eq("  counts: booked 0, pending 1", [sum.booked, sum.pending], [0, 1]);
eq("  per-room state is pending w/ guest", sum.rooms.find((r) => r.id === "A"), { id: "A", name: "Misty Ridge", state: "pending", guest: "Guest from website" });
sum = summarizeDate(idx, rooms, "2026-10-16");
eq("departure day: open, hint only", [sum.kind, sum.leaving], ["open", 0]);
idx = buildCalendarIndex([book("A", "2026-10-14", "2026-10-16")], av("A", "2026-10-14", "2026-10-15", "2026-10-16"));
sum = summarizeDate(idx, [rooms[0]], "2026-10-16");
eq("single room on its check-out day (availability flagged) -> kind checkout", [sum.kind, sum.leaving], ["checkout", 1]);

// 6. Check-out day: a NOTE on the unavailable row means someone closed that night on purpose
const noted = (room: string, date: string, note: string) => ({ room_id: room, date, note });
idx = buildCalendarIndex([book("A", "2026-10-05", "2026-10-07")], [...av("A", "2026-10-05", "2026-10-06"), noted("A", "2026-10-07", "Maintenance")]);
eq("check-out day with a reason -> blocked (can be seen and reopened)", stateOf(idx, "A", "2026-10-07"), { state: "blocked" });
idx = buildCalendarIndex([book("A", "2026-10-05", "2026-10-07")], [...av("A", "2026-10-05", "2026-10-06"), noted("A", "2026-10-07", "ical:abc:Booking.com")]);
eq("check-out day closed by a synced calendar -> blocked", stateOf(idx, "A", "2026-10-07"), { state: "blocked" });
idx = buildCalendarIndex([book("A", "2026-10-05", "2026-10-07")], [...av("A", "2026-10-05", "2026-10-06"), noted("A", "2026-10-07", "   ")]);
eq("a blank note does not turn it into a block", stateOf(idx, "A", "2026-10-07"), { state: "checkout", name: "Ravi Nair" });
idx = buildCalendarIndex([book("A", "2026-10-05", "2026-10-07")], [...av("A", "2026-10-05", "2026-10-06"), { room_id: "A", date: "2026-10-07", note: null }]);
eq("no note on a check-out day stays checkout (legacy booking row)", stateOf(idx, "A", "2026-10-07"), { state: "checkout", name: "Ravi Nair" });
idx = buildCalendarIndex([], [noted("A", "2026-10-12", "Festival")]);
eq("a noted block with no booking is still just blocked", stateOf(idx, "A", "2026-10-12"), { state: "blocked" });

// 7. Which booking is behind a tapped cell
const bk = (id: string, room: string, ci: string, co: string, status = "confirmed", name = "G") => ({ id, room_id: room, status, guest_name: name, check_in: ci, check_out: co, group_id: null });
const list = [bk("b1", "A", "2026-10-05", "2026-10-07", "confirmed", "Ravi"), bk("b2", "A", "2026-10-07", "2026-10-09", "pending", "Priya"), bk("b3", "B", "2026-10-05", "2026-10-06"), bk("b4", "A", "2026-10-20", "2026-10-22", "cancelled")];
eq("a night in a booking -> that booking", bookingForCell(list, "A", "2026-10-06", "booked")?.id, "b1");
eq("a pending night -> the pending request", bookingForCell(list, "A", "2026-10-08", "pending")?.id, "b2");
eq("check-out day -> the booking that leaves (not the one arriving)", bookingForCell(list, "A", "2026-10-07", "checkout")?.id, "b1");
eq("other room is not mixed up", bookingForCell(list, "B", "2026-10-05", "booked")?.id, "b3");
eq("cancelled bookings are never returned", bookingForCell(list, "A", "2026-10-21", "booked"), undefined);
eq("open / blocked cells have no booking", bookingForCell(list, "A", "2026-10-06", "open"), undefined);
eq("confirmed beats pending on the same night", bookingForCell([bk("p", "A", "2026-11-01", "2026-11-03", "pending"), bk("c", "A", "2026-11-01", "2026-11-03", "confirmed")], "A", "2026-11-02", "booked")?.id, "c");

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
