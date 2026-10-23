import test from "node:test";
import assert from "node:assert/strict";
import { buildLedgerItems, summarizeItems, agentDeletePreview, deleteAgentMessage } from "./commissionLedger";

const b = (id: string, over: Record<string, unknown> = {}) => ({ id, source: "agent", agent_id: "A1", commission_amount: 100, commission_paid: false, commission_paid_date: null, guest_name: `G-${id}`, check_in: "2027-03-01", status: "confirmed", ...over });

test("a cancelled booking owes nothing and is hidden, unless its commission was already paid", () => {
  const items = buildLedgerItems([b("1", { status: "cancelled" }), b("2", { status: "cancelled", commission_paid: true }), b("3")], []);
  assert.deepEqual(items.map((i) => i.id).sort(), ["2", "3"]);
});

test("only confirmed/completed unpaid commission is OWED; pending requests are listed separately", () => {
  const items = buildLedgerItems([
    b("1", { status: "confirmed", commission_amount: 100 }),
    b("2", { status: "completed", commission_amount: 50 }),
    b("3", { status: "pending", commission_amount: 400 }),               // may expire — not owed yet
    b("4", { status: "confirmed", commission_amount: 70, commission_paid: true }),
    b("5", { status: "cancelled", commission_amount: 30, commission_paid: true }),
  ], []);
  assert.deepEqual(summarizeItems(items), { owed: 150, pending: 400, paid: 70, paidOnCancelled: 30 });
});

test("the total no longer jumps when a pending request auto-expires", () => {
  const before = summarizeItems(buildLedgerItems([b("1"), b("2", { status: "pending", commission_amount: 999 })], []));
  const after = summarizeItems(buildLedgerItems([b("1"), b("2", { status: "cancelled", commission_amount: 999 })], []));
  assert.equal(before.owed, after.owed);
});

test("rooms of a group carry no commission of their own; the group is listed once", () => {
  const items = buildLedgerItems(
    [b("r1"), b("r2"), b("solo")],
    [{ ...b("g1", { commission_amount: 500 }), bookings: [{ id: "r1" }, { id: "r2" }] }],
  );
  assert.deepEqual(items.map((i) => `${i.kind}:${i.id}`).sort(), ["booking:solo", "group:g1"]);
  assert.equal(items.find((i) => i.kind === "group")?.roomLabel, "2 rooms");
});

test("bookings that are not agent bookings, or have no commission amount, are not listed", () => {
  assert.equal(buildLedgerItems([b("1", { source: "direct" }), b("2", { commission_amount: null }), b("3", { agent_id: null })], []).length, 0);
});

test("delete preview counts every record of that agent, any status, and splits paid/unpaid", () => {
  const p = agentDeletePreview(
    [b("1", { commission_amount: 100 }), b("2", { status: "cancelled", commission_amount: 40, commission_paid: true }), b("3", { agent_id: "A2", commission_amount: 999 }), b("r1")],
    [{ ...b("g1", { commission_amount: 500 }), bookings: [{ id: "r1" }] }],
    "A1",
  );
  assert.deepEqual(p, { records: 3, unpaid: 600, paid: 40 });
});

test("delete message states what will be erased and that bookings stay; no-record agents get a short one", () => {
  const m = deleteAgentMessage("Anil", { records: 3, unpaid: 600, paid: 40 });
  assert.match(m, /Anil AND their commission records/);
  assert.match(m, /3 bookings/); assert.match(m, /₹600 unpaid/); assert.match(m, /₹40 already paid/); assert.match(m, /bookings themselves stay/);
  assert.match(deleteAgentMessage("Ravi", { records: 0, unpaid: 0, paid: 0 }), /no commission records/);
  assert.match(deleteAgentMessage("Ravi", { records: 1, unpaid: 5, paid: 0 }), /1 booking:/);
});
