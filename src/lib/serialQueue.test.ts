   import test from "node:test";
import assert from "node:assert/strict";
import { createSerialQueue } from "./serialQueue";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("tasks run strictly one after another, in order, even when an earlier one is slower", async () => {
  const q = createSerialQueue();
  const log: string[] = [];
  const a = q.enqueue(async () => { log.push("a:start"); await sleep(30); log.push("a:end"); return "A"; });
  const b = q.enqueue(async () => { log.push("b:start"); await sleep(1); log.push("b:end"); return "B"; });
  assert.deepEqual(await Promise.all([a, b]), ["A", "B"]);
  assert.deepEqual(log, ["a:start", "a:end", "b:start", "b:end"]);
});

test("a double tap saves ONE quote: the second save updates the quote the first created", async () => {
  // A fake database: save(id?) creates a new quote when no id is given, otherwise updates it.
  const quotes = new Map<string, number>();
  let next = 0;
  const save = async (id: string | undefined) => { await sleep(20); const key = id ?? `q${++next}`; quotes.set(key, (quotes.get(key) ?? 0) + 1); return key; };

  // the screen's logic: read the saved id when THIS save runs, store it when it finishes
  const run = (queue: ReturnType<typeof createSerialQueue>, ref: { id?: string }) => queue.enqueue(async () => { ref.id = await save(ref.id); });

  const queued = createSerialQueue(); const ref1: { id?: string } = {};
  await Promise.all([run(queued, ref1), run(queued, ref1)]);
  assert.equal(quotes.size, 1, "serialised: one quote");

  quotes.clear(); next = 0;
  const ref2: { id?: string } = {};                       // the OLD behaviour: each tap reads the id immediately
  const unqueued = (r: { id?: string }) => (async () => { const id = r.id; r.id = await save(id); })();
  await Promise.all([unqueued(ref2), unqueued(ref2)]);
  assert.equal(quotes.size, 2, "unqueued: two quotes (the bug)");
});

test("a failing task does not block the ones after it, and its error still reaches its caller", async () => {
  const q = createSerialQueue();
  const failing = q.enqueue(async () => { throw new Error("offline"); });
  const after = q.enqueue(async () => "ok");
  await assert.rejects(() => failing, /offline/);
  assert.equal(await after, "ok");
});
