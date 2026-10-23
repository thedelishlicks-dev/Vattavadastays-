 // src/lib/serialQueue.ts — run async tasks one after another, in the order they were queued.
//
// Used for saving a quote: a second tap while the first save is still running must wait and
// then UPDATE the quote the first one created (its id is only known once the first save
// finishes). Running both at once saved the quote twice.

export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    /** Queue `task`; resolves with its result. A failing task never blocks the ones queued after it. */
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      const run = tail.then(task, task);
      tail = run.catch(() => undefined);
      return run;
    },
  };
}
