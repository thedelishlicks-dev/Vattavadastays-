 import test from "node:test";
import assert from "node:assert/strict";
import { setBookingStatus, cancelBooking, setGroupStatus, cancelGroup, setGroupDiscount, setCommissionPaid, deleteAgentWithCommissions, saveFailMessage, NotSavedError, NOT_SAVED_MESSAGE, OFFLINE_MESSAGE, statusUpdate } from "./bookingActions";

// Supabase's errors are plain objects ({ message, code }), not Error instances.
const rejectsWith = (fn: () => Promise<unknown>, text: string) =>
  assert.rejects(fn, (e: unknown) => String((e as { message?: string })?.message ?? e).includes(text));

// ── A tiny fake of the Supabase call shape: from(t).update(v).eq(c,x)[.select()] ──
type Row = Record<string, unknown>;
function makeDb(opts: { fail?: { table: string; message?: string }[]; zeroRows?: string[]; failRestore?: boolean } = {}) {
  const tables: Record<string, Row[]> = {
    bookings: [
      { id: "b1", group_id: null, status: "pending", hold_expires_at: "2027-01-01T00:00:00Z" },
      { id: "r1", group_id: "g1", status: "pending", hold_expires_at: "2027-01-01T00:00:00Z" },
      { id: "r2", group_id: "g1", status: "pending", hold_expires_at: "2027-01-01T00:00:00Z" },
    ],
    booking_groups: [{ id: "g1", status: "pending", hold_expires_at: "2027-01-01T00:00:00Z" }],
  };
  const log: string[] = [];
  let groupUpdates = 0;
  const db = {
    from(table: string) {
      return {
        update(values: Row) {
          let col = "", val: unknown, wantRows = false;
          const run = () => {
            log.push(`${table}.update(${JSON.stringify(values)}).eq(${col},${val})`);
            if (table === "booking_groups") groupUpdates += 1;
            const isRestore = table === "booking_groups" && groupUpdates > 1;
            const failing = opts.fail?.find((f) => f.table === table);
            if (failing && !(isRestore && !opts.failRestore)) return { data: null, error: { message: failing.message ?? "boom" } };
            if (isRestore && opts.failRestore) throw new Error("restore also failed");
            if (opts.zeroRows?.includes(table)) return { data: [], error: null };
            const hit = tables[table].filter((r) => r[col] === val);
            for (const r of hit) Object.assign(r, values);
            return { data: wantRows ? hit.map((r) => ({ id: r.id })) : null, error: null };
          };
          const b: { eq(c: string, v: unknown): typeof b; select(): typeof b; then(res: (r: unknown) => unknown, rej?: (e: unknown) => unknown): Promise<unknown> } = {
            eq(c, v) { col = c; val = v; return b; },
            select() { wantRows = true; return b; },
            then(res, rej) { try { return Promise.resolve(run()).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); } },
          };
          return b;
        },
      };
    },
  };
  return { db: db as never, tables, log };
}

test("single booking: Confirm writes status and ends the hold; Complete also stamps check-out", async () => {
  const { db, tables } = makeDb();
  const u = await setBookingStatus(db, "b1", "confirmed");
  assert.equal(tables.bookings[0].status, "confirmed");
  assert.equal(tables.bookings[0].hold_expires_at, null);
  assert.equal(u.status, "confirmed");
  await setBookingStatus(db, "b1", "completed");
  assert.ok(typeof tables.bookings[0].checked_out_at === "string");
});

test("single booking: a database error THROWS (so no success message / WhatsApp) and changes nothing", async () => {
  const { db, tables } = makeDb({ fail: [{ table: "bookings", message: "connection reset" }] });
  await rejectsWith(() => setBookingStatus(db, "b1", "confirmed"), "connection reset");
  assert.equal(tables.bookings[0].status, "pending");
});

test("single booking: zero rows updated (expired login) is a failure, not a success", async () => {
  const { db } = makeDb({ zeroRows: ["bookings"] });
  await assert.rejects(() => setBookingStatus(db, "b1", "confirmed"), NotSavedError);
  await assert.rejects(() => cancelBooking(db, "b1"), NotSavedError);
});

test("single booking cancel: success and failure", async () => {
  const ok = makeDb();
  await cancelBooking(ok.db, "b1");
  assert.equal(ok.tables.bookings[0].status, "cancelled");
  const bad = makeDb({ fail: [{ table: "bookings" }] });
  await assert.rejects(() => cancelBooking(bad.db, "b1"));
  assert.equal(bad.tables.bookings[0].status, "pending");
});

test("group: Confirm updates the group then every room", async () => {
  const { db, tables } = makeDb();
  await setGroupStatus(db, { id: "g1", status: "pending", hold_expires_at: "2027-01-01T00:00:00Z" }, "confirmed");
  assert.equal(tables.booking_groups[0].status, "confirmed");
  assert.deepEqual(tables.bookings.filter((r) => r.group_id === "g1").map((r) => r.status), ["confirmed", "confirmed"]);
  assert.equal(tables.bookings[0].status, "pending"); // the standalone booking is untouched
});

test("group: if the group write fails, rooms are never touched", async () => {
  const { db, tables, log } = makeDb({ fail: [{ table: "booking_groups" }] });
  await assert.rejects(() => setGroupStatus(db, { id: "g1", status: "pending" }, "confirmed"));
  assert.ok(!log.some((l) => l.startsWith("bookings.")));
  assert.deepEqual(tables.bookings.filter((r) => r.group_id === "g1").map((r) => r.status), ["pending", "pending"]);
});

test("group: zero rows on the group (expired login) throws NotSavedError and skips the rooms", async () => {
  const { db, log } = makeDb({ zeroRows: ["booking_groups"] });
  await assert.rejects(() => cancelGroup(db, { id: "g1", status: "pending" }), NotSavedError);
  assert.ok(!log.some((l) => l.startsWith("bookings.")));
});

test("group: if the rooms fail AFTER the group changed, the group is put back — status AND hold", async () => {
  const { db, tables } = makeDb({ fail: [{ table: "bookings", message: "timeout" }] });
  await rejectsWith(() => setGroupStatus(db, { id: "g1", status: "pending", hold_expires_at: "2027-01-01T00:00:00Z" }, "confirmed"), "timeout");
  assert.equal(tables.booking_groups[0].status, "pending");
  assert.equal(tables.booking_groups[0].hold_expires_at, "2027-01-01T00:00:00Z"); // can still expire
});

test("group cancel: rooms failing restores the group; a failing restore still reports the ORIGINAL error", async () => {
  const a = makeDb({ fail: [{ table: "bookings", message: "rooms failed" }] });
  await rejectsWith(() => cancelGroup(a.db, { id: "g1", status: "confirmed" }), "rooms failed");
  assert.equal(a.tables.booking_groups[0].status, "confirmed");
  const b = makeDb({ fail: [{ table: "bookings", message: "rooms failed" }], failRestore: true });
  await rejectsWith(() => cancelGroup(b.db, { id: "g1", status: "confirmed" }), "rooms failed");
});

test("saveFailMessage: network, expired login, and ordinary errors read clearly", () => {
  assert.equal(saveFailMessage(new NotSavedError()), NOT_SAVED_MESSAGE);
  assert.equal(saveFailMessage(new TypeError("Load failed")), OFFLINE_MESSAGE);
  assert.equal(saveFailMessage(new TypeError("Failed to fetch")), OFFLINE_MESSAGE);
  assert.match(saveFailMessage({ message: "permission denied" }), /permission denied/);
  assert.match(saveFailMessage(null), /nothing was changed/);
});

test("statusUpdate: only 'completed' stamps check-out; only non-pending clears the hold", () => {
  const now = new Date("2026-10-19T10:00:00Z");
  assert.deepEqual(statusUpdate("pending", now), { status: "pending" });
  assert.deepEqual(statusUpdate("confirmed", now), { status: "confirmed", hold_expires_at: null });
  assert.deepEqual(statusUpdate("completed", now), { status: "completed", checked_out_at: "2026-10-19T10:00:00.000Z", hold_expires_at: null });
});

test("group discount: saved, error, and expired-login cases", async () => {
  const ok = makeDb();
  await setGroupDiscount(ok.db, "g1", 500, "Group booking");
  assert.equal(ok.tables.booking_groups[0].discount_amount, 500);
  assert.equal(ok.tables.booking_groups[0].discount_reason, "Group booking");
  await setGroupDiscount(ok.db, "g1", 0, "");
  assert.equal(ok.tables.booking_groups[0].discount_reason, null);
  const bad = makeDb({ fail: [{ table: "booking_groups", message: "offline" }] });
  await rejectsWith(() => setGroupDiscount(bad.db, "g1", 500, "x"), "offline");
  const none = makeDb({ zeroRows: ["booking_groups"] });
  await assert.rejects(() => setGroupDiscount(none.db, "g1", 500, "x"), NotSavedError);
});

test("commission paid / not paid: saves the flag and the date, for bookings and groups", async () => {
  const { db, tables } = makeDb();
  tables.bookings[0].commission_paid = false;
  await setCommissionPaid(db, "booking", "b1", true, new Date("2026-10-20T10:00:00Z"));
  assert.equal(tables.bookings[0].commission_paid, true);
  assert.equal(tables.bookings[0].commission_paid_date, "2026-10-20T10:00:00.000Z");
  await setCommissionPaid(db, "booking", "b1", false);
  assert.equal(tables.bookings[0].commission_paid, false);
  assert.equal(tables.bookings[0].commission_paid_date, null);
  await setCommissionPaid(db, "group", "g1", true);
  assert.equal(tables.booking_groups[0].commission_paid, true);
});

test("commission paid: errors and expired logins are failures, not silent successes", async () => {
  await rejectsWith(() => setCommissionPaid(makeDb({ fail: [{ table: "bookings", message: "offline" }] }).db, "booking", "b1", true), "offline");
  await assert.rejects(() => setCommissionPaid(makeDb({ zeroRows: ["booking_groups"] }).db, "group", "g1", true), NotSavedError);
});

test("delete agent: returns what was cleared; a refusal surfaces a clear message", async () => {
  const ok = { rpc: async (name: string, args: unknown) => { assert.equal(name, "delete_agent_with_commissions"); assert.deepEqual(args, { p_agent_id: "A1" }); return { data: { bookings: 2, groups: 1 }, error: null }; } };
  assert.deepEqual(await deleteAgentWithCommissions(ok as never, "A1"), { bookings: 2, groups: 1 });
  const refused = { rpc: async () => ({ data: null, error: { message: "AGENT_NOT_FOUND" } }) };
  await assert.rejects(() => deleteAgentWithCommissions(refused as never, "A1"), (e: unknown) => /no longer exists/.test(saveFailMessage(e)));
  const offline = { rpc: async () => ({ data: null, error: { message: "Failed to fetch" } }) };
  await assert.rejects(() => deleteAgentWithCommissions(offline as never, "A1"), (e: unknown) => saveFailMessage(e) === OFFLINE_MESSAGE);
});
