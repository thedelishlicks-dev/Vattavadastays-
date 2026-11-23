/**
 * Unit tests for education.ts, educationDestinations.ts and the lesson content.
 *   npx tsx --test src/lib/education.test.ts
 *
 * These protect behaviour an owner would notice: lessons that appear in the right order, links that
 * go to screens that exist, progress that survives a refresh and never leaks between owners or
 * properties, and definitions that agree with the rest of the app.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EDUCATION_CATEGORIES,
  EDUCATION_LESSONS,
  type EducationLesson,
} from "../content/educationLessons";
import { GUIDE_GROUPS } from "../content/ownerGuide";
import { NAV_SECTIONS } from "../admin/navConfig";
import { EDUCATION_DESTINATIONS, isDestinationKey } from "./educationDestinations";
import {
  averageDailyRate,
  estimatedOperatingProfit,
  occupancyPercent,
  revPar,
} from "./businessMetrics";
import {
  categoryTitle,
  completedIds,
  continueLesson,
  findLesson,
  helpHref,
  lessonsForCategory,
  loadProgress,
  nextLesson,
  prerequisiteHint,
  progressFor,
  progressKey,
  publishedLessons,
  resolveAction,
  saveProgress,
  setLessonDone,
  validateLessons,
} from "./education";

// ── helpers ─────────────────────────────────────────────────────────────────

/** A lesson that passes every rule; tests break one thing at a time. */
function lesson(over: Partial<EducationLesson> = {}): EducationLesson {
  return {
    id: "a",
    slug: "a",
    title: "A",
    category: "start",
    description: "d",
    minutes: 3,
    objectives: ["one", "two"],
    body: [{ type: "p", text: "x" }],
    whyItMatters: "w",
    actionSteps: ["do"],
    actionLabel: "Open Home",
    destination: "home",
    measure: "m",
    published: true,
    order: 10,
    ...over,
  };
}

/** A minimal in-memory Storage, with optional failure switches. */
function memoryStore(opts: { failRead?: boolean; failWrite?: boolean } = {}) {
  const m = new Map<string, string>();
  return {
    raw: m,
    getItem(k: string) {
      if (opts.failRead) throw new Error("blocked");
      return m.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      if (opts.failWrite) throw new Error("full");
      m.set(k, v);
    },
    removeItem(k: string) {
      m.delete(k);
    },
  };
}

const allText = (l: EducationLesson) =>
  [
    l.title,
    l.description,
    ...l.objectives,
    ...l.body.flatMap((b) => ("text" in b ? [b.text] : b.items)),
    l.whyItMatters,
    ...l.actionSteps,
    l.measure,
  ].join("\n");

const NOW = new Date("2026-11-23T10:00:00.000Z");

// ── content model ───────────────────────────────────────────────────────────

test("the starter content passes every validation rule", () => {
  assert.deepEqual(validateLessons(EDUCATION_LESSONS), []);
});

test("starter set is 10 to 12 lessons and every category has at least one", () => {
  assert.ok(EDUCATION_LESSONS.length >= 10 && EDUCATION_LESSONS.length <= 12);
  for (const c of EDUCATION_CATEGORIES) {
    assert.ok(
      publishedLessons().some((l) => l.category === c.id),
      `category ${c.id} has no lesson`,
    );
  }
});

test("ids, slugs and orders are unique", () => {
  for (const key of ["id", "slug", "order"] as const) {
    const values = EDUCATION_LESSONS.map((l) => l[key]);
    assert.equal(new Set(values).size, values.length, `duplicate ${key}`);
  }
});

test("validation catches duplicate ids, slugs and orders", () => {
  const dupId = validateLessons([lesson(), lesson({ slug: "b", order: 20 })]);
  assert.ok(dupId.some((p) => p.includes("duplicate id")));
  const dupSlug = validateLessons([lesson(), lesson({ id: "b", order: 20 })]);
  assert.ok(dupSlug.some((p) => p.includes("duplicate slug")));
  const dupOrder = validateLessons([lesson(), lesson({ id: "b", slug: "b" })]);
  assert.ok(dupOrder.some((p) => p.includes("duplicate order")));
});

test("validation catches a bad slug, empty fields, a long lesson and missing objectives", () => {
  assert.ok(validateLessons([lesson({ slug: "Bad Slug" })]).some((p) => p.includes("slug")));
  assert.ok(validateLessons([lesson({ measure: "  " })]).some((p) => p.includes("measure")));
  assert.ok(
    validateLessons([lesson({ whyItMatters: "" })]).some((p) => p.includes("whyItMatters")),
  );
  assert.ok(validateLessons([lesson({ minutes: 25 })]).some((p) => p.includes("minutes")));
  assert.ok(
    validateLessons([lesson({ objectives: ["only one"] })]).some((p) => p.includes("objectives")),
  );
  assert.ok(validateLessons([lesson({ actionSteps: [] })]).some((p) => p.includes("action steps")));
});

test("validation catches an unknown category and an unknown or label-less destination", () => {
  assert.ok(
    validateLessons([lesson({ category: "nope" as never })]).some((p) => p.includes("category")),
  );
  assert.ok(
    validateLessons([lesson({ destination: "pricing" as never })]).some((p) =>
      p.includes("not a real screen"),
    ),
  );
  assert.ok(validateLessons([lesson({ actionLabel: "" })]).some((p) => p.includes("actionLabel")));
});

test("validation catches a missing, self or later prerequisite", () => {
  assert.ok(
    validateLessons([lesson({ prerequisite: "ghost" })]).some((p) => p.includes("does not exist")),
  );
  assert.ok(
    validateLessons([lesson({ prerequisite: "a" })]).some((p) => p.includes("own prerequisite")),
  );
  const later = validateLessons([
    lesson({ prerequisite: "b" }),
    lesson({ id: "b", slug: "b", order: 20 }),
  ]);
  assert.ok(later.some((p) => p.includes("earlier")));
});

test("a lesson without a destination is valid (no action is better than a fake one)", () => {
  assert.deepEqual(validateLessons([lesson({ destination: undefined, actionLabel: "" })]), []);
});

test("every lesson answers the five questions", () => {
  for (const l of EDUCATION_LESSONS) {
    assert.ok(l.body.length > 0, `${l.id}: nothing to understand`);
    assert.ok(l.whyItMatters.trim(), `${l.id}: no why`);
    assert.ok(l.actionSteps.length > 0, `${l.id}: nothing to do`);
    assert.ok(l.destination, `${l.id}: no Stayidom screen to do it in`);
    assert.ok(l.measure.trim(), `${l.id}: no way to measure`);
  }
});

test("lessons are short: no image or table blocks, and 10 minutes at most", () => {
  for (const l of EDUCATION_LESSONS) {
    assert.ok(l.minutes <= 10);
    assert.ok(
      l.body.every((b) => ["p", "list", "steps", "note"].includes(b.type)),
      `${l.id}: heavy block`,
    );
  }
});

// ── order, filtering, navigation ────────────────────────────────────────────

test("lessons come back in path order whatever order they are stored in", () => {
  const shuffled = [
    lesson({ id: "c", slug: "c", order: 30 }),
    lesson({ id: "a", order: 10 }),
    lesson({ id: "b", slug: "b", order: 20 }),
  ];
  assert.deepEqual(
    publishedLessons(shuffled).map((l) => l.id),
    ["a", "b", "c"],
  );
});

test("unpublished lessons are hidden everywhere and cannot be opened by slug", () => {
  const list = [lesson(), lesson({ id: "b", slug: "b", order: 20, published: false })];
  assert.deepEqual(
    publishedLessons(list).map((l) => l.id),
    ["a"],
  );
  assert.equal(findLesson("b", list), undefined);
  assert.equal(nextLesson("a", list), null);
  assert.equal(progressFor(new Set(), "all", list).total, 1);
});

test("category filtering returns only that category, in order; 'all' returns everything", () => {
  for (const c of EDUCATION_CATEGORIES) {
    const got = lessonsForCategory(c.id);
    assert.ok(got.length > 0);
    assert.ok(got.every((l) => l.category === c.id));
    assert.deepEqual(
      got.map((l) => l.order),
      [...got.map((l) => l.order)].sort((a, b) => a - b),
    );
  }
  assert.equal(lessonsForCategory("all").length, publishedLessons().length);
  const sum = EDUCATION_CATEGORIES.reduce((n, c) => n + lessonsForCategory(c.id).length, 0);
  assert.equal(sum, publishedLessons().length, "every lesson belongs to exactly one category");
});

test("findLesson finds by slug and returns undefined for an unknown slug", () => {
  const first = publishedLessons()[0];
  assert.equal(findLesson(first.slug)?.id, first.id);
  assert.equal(findLesson("no-such-lesson"), undefined);
});

test("nextLesson follows the path and ends at the last lesson", () => {
  const list = publishedLessons();
  assert.equal(nextLesson(list[0].id)?.id, list[1].id);
  assert.equal(nextLesson(list[list.length - 1].id), null);
  assert.equal(nextLesson("unknown"), null);
});

test("continueLesson offers the first unfinished lesson, preferring the one after the lesson just done", () => {
  const list = publishedLessons();
  assert.equal(continueLesson(new Set())?.id, list[0].id);
  assert.equal(continueLesson(new Set([list[0].id]))?.id, list[1].id);
  // Lesson 4 done but lesson 2 skipped: "after 4" offers 5, not 2.
  const done = new Set([list[0].id, list[2].id, list[3].id]);
  assert.equal(continueLesson(done, list[3].id)?.id, list[4].id);
  // At the end, it goes back to what was skipped.
  const allButTwo = new Set(list.filter((l) => l.id !== list[1].id).map((l) => l.id));
  assert.equal(continueLesson(allButTwo, list[list.length - 1].id)?.id, list[1].id);
  assert.equal(continueLesson(new Set(list.map((l) => l.id))), null);
});

test("progressFor counts whole numbers per category and overall", () => {
  const first = lessonsForCategory("start");
  const done = new Set([first[0].id]);
  assert.deepEqual(progressFor(done, "start"), {
    done: 1,
    total: first.length,
    percent: Math.round(100 / first.length),
  });
  assert.deepEqual(progressFor(done, "numbers"), {
    done: 0,
    total: lessonsForCategory("numbers").length,
    percent: 0,
  });
  assert.equal(progressFor(new Set(publishedLessons().map((l) => l.id))).percent, 100);
  assert.equal(progressFor(new Set(), "all", []).percent, 0, "no lessons is 0%, not NaN");
});

test("prerequisiteHint shows until the prerequisite is done, then goes away", () => {
  const withPre = publishedLessons().find((l) => l.prerequisite)!;
  assert.equal(prerequisiteHint(withPre, new Set())?.id, withPre.prerequisite);
  assert.equal(prerequisiteHint(withPre, new Set([withPre.prerequisite!])), null);
  const none = publishedLessons().find((l) => !l.prerequisite)!;
  assert.equal(prerequisiteHint(none, new Set()), null);
});

test("categoryTitle uses the category's title", () => {
  assert.equal(categoryTitle("numbers"), "Understand your numbers");
});

// ── contextual actions and destinations ─────────────────────────────────────

test("resolveAction builds the link for a lesson's real destination", () => {
  const a = resolveAction(lesson({ destination: "report", actionLabel: "Open Monthly report" }));
  assert.deepEqual(a, {
    label: "Open Monthly report",
    to: "/admin/report",
    search: {},
    screen: "Money → Monthly report",
  });
});

test("resolveAction carries ?property= and ignores a blank one", () => {
  assert.deepEqual(resolveAction(lesson(), "vattavada-villa")?.search, {
    property: "vattavada-villa",
  });
  assert.deepEqual(resolveAction(lesson(), "  ")?.search, {});
  assert.deepEqual(resolveAction(lesson(), null)?.search, {});
});

test("resolveAction returns null, never a fake link, for a missing, unknown or label-less destination", () => {
  assert.equal(resolveAction(lesson({ destination: undefined })), null);
  assert.equal(resolveAction(lesson({ destination: "pricing" as never })), null);
  assert.equal(resolveAction(lesson({ destination: "__proto__" as never })), null);
  assert.equal(resolveAction(lesson({ actionLabel: "   " })), null);
});

test("every real lesson resolves to a real action", () => {
  for (const l of publishedLessons()) {
    const a = resolveAction(l);
    assert.ok(a, `${l.id} has no action`);
    assert.ok(a.to.startsWith("/admin/"));
  }
});

test("every destination is a page in the navigation and a real route file, not a redirect", () => {
  const navPaths = new Set(NAV_SECTIONS.flatMap((s) => s.tabs.map((t) => t.to)));
  for (const [key, dest] of Object.entries(EDUCATION_DESTINATIONS)) {
    assert.ok(isDestinationKey(key));
    assert.ok(navPaths.has(dest.to), `${key} → ${dest.to} is not in the navigation`);
    const file = join(process.cwd(), "src/routes", `${dest.to.slice(1).replace(/\//g, ".")}.tsx`);
    assert.ok(existsSync(file), `${key} → ${dest.to}: route file missing (${file})`);
    assert.ok(!/redirect\(/.test(readFileSync(file, "utf8")), `${key} → ${dest.to} only redirects`);
  }
  assert.ok(
    !Object.values(EDUCATION_DESTINATIONS).some((d) => (d.to as string) === "/admin/pricing"),
  );
  assert.ok(
    !isDestinationKey("pricing") && !isDestinationKey("guests") && !isDestinationKey("sources"),
  );
});

test("related Help links point at Help sections that exist", () => {
  const helpIds = new Set(GUIDE_GROUPS.flatMap((g) => g.sections.map((s) => s.id)));
  for (const l of EDUCATION_LESSONS.filter((x) => x.relatedHelp)) {
    assert.ok(
      helpIds.has(l.relatedHelp!),
      `${l.id}: Help section "${l.relatedHelp}" does not exist`,
    );
    assert.equal(helpHref(l), `/help#${l.relatedHelp}`);
  }
  assert.equal(helpHref(lesson()), null);
});

// ── progress: persistence, toggling, scoping ────────────────────────────────

test("progress key names both the user and the property, and is null when either is unknown", () => {
  assert.equal(progressKey("u1", "p1"), "stayidom:education:v1:u1:p1");
  assert.equal(progressKey(undefined, "p1"), null);
  assert.equal(progressKey("u1", null), null);
  assert.equal(progressKey("", "p1"), null);
});

test("progress survives a reload: what is saved is what is loaded", () => {
  const store = memoryStore();
  const key = progressKey("u1", "p1");
  const map = setLessonDone({}, "focus-first", true, NOW);
  assert.equal(saveProgress(store, key, map), true);
  assert.deepEqual(loadProgress(store, key), { "focus-first": NOW.toISOString() });
});

test("completing and un-completing a lesson", () => {
  const done = setLessonDone({}, "x", true, NOW);
  assert.deepEqual(done, { x: NOW.toISOString() });
  const undone = setLessonDone(done, "x", false, NOW);
  assert.deepEqual(undone, {});
  // Completing twice keeps one entry; un-completing something never completed is harmless.
  assert.deepEqual(Object.keys(setLessonDone(done, "x", true, NOW)), ["x"]);
  assert.deepEqual(setLessonDone({}, "never", false, NOW), {});
});

test("setLessonDone never changes the map it is given", () => {
  const before = { a: "2026-01-01T00:00:00.000Z" };
  const frozen = Object.freeze({ ...before });
  const next = setLessonDone(frozen, "b", true, NOW);
  assert.deepEqual(frozen, before);
  assert.notEqual(next, frozen);
});

test("progress is scoped: another property or another user starts empty", () => {
  const store = memoryStore();
  saveProgress(
    store,
    progressKey("owner-1", "villa-a"),
    setLessonDone({}, "focus-first", true, NOW),
  );
  assert.deepEqual(Object.keys(loadProgress(store, progressKey("owner-1", "villa-a"))), [
    "focus-first",
  ]);
  assert.deepEqual(
    loadProgress(store, progressKey("owner-1", "villa-b")),
    {},
    "same owner, other property",
  );
  assert.deepEqual(
    loadProgress(store, progressKey("owner-2", "villa-a")),
    {},
    "other owner, same property",
  );
});

test("progress is independent: ticking on one property does not change another's", () => {
  const store = memoryStore();
  const a = progressKey("u", "p-a");
  const b = progressKey("u", "p-b");
  saveProgress(store, a, setLessonDone({}, "one", true, NOW));
  saveProgress(store, b, setLessonDone({}, "two", true, NOW));
  saveProgress(store, a, setLessonDone(loadProgress(store, a), "one", false, NOW));
  assert.deepEqual(loadProgress(store, a), {});
  assert.deepEqual(Object.keys(loadProgress(store, b)), ["two"]);
});

test("nothing is saved or loaded without a key (no shared global fallback)", () => {
  const store = memoryStore();
  assert.equal(saveProgress(store, null, { x: NOW.toISOString() }), false);
  assert.equal(store.raw.size, 0);
  assert.deepEqual(loadProgress(store, null), {});
});

test("broken or foreign saved data counts as no progress and never throws", () => {
  const key = "k";
  for (const bad of [
    "not json",
    "null",
    "[]",
    '{"v":2,"completed":{"a":"x"}}',
    '{"v":1}',
    '{"v":1,"completed":"x"}',
  ]) {
    const store = memoryStore();
    store.setItem(key, bad);
    assert.deepEqual(loadProgress(store, key), {}, `input ${bad}`);
  }
  const mixed = memoryStore();
  mixed.setItem(
    key,
    JSON.stringify({ v: 1, completed: { good: "2026-01-01T00:00:00.000Z", bad: 5, worse: null } }),
  );
  assert.deepEqual(loadProgress(mixed, key), { good: "2026-01-01T00:00:00.000Z" });
});

test("blocked storage (private mode) never throws: load is empty, save reports false", () => {
  assert.deepEqual(loadProgress(memoryStore({ failRead: true }), "k"), {});
  assert.equal(saveProgress(memoryStore({ failWrite: true }), "k", {}), false);
  assert.deepEqual(loadProgress(null, "k"), {});
  assert.equal(saveProgress(undefined, "k", {}), false);
});

test("lessons that no longer exist or are unpublished drop out of the counts but stay saved", () => {
  const list = [lesson(), lesson({ id: "b", slug: "b", order: 20, published: false })];
  const map = { a: NOW.toISOString(), b: NOW.toISOString(), gone: NOW.toISOString() };
  assert.deepEqual([...completedIds(map, list)], ["a"]);
  assert.equal(Object.keys(map).length, 3, "the saved map itself is untouched");
});

// ── definitions agree with the rest of the app ──────────────────────────────

test("Occupancy, ADR and RevPAR lesson uses the app's formulas, and its example adds up", () => {
  const l = EDUCATION_LESSONS.find((x) => x.id === "occupancy-adr-revpar")!;
  const text = allText(l);
  assert.match(text, /occupied room nights ÷ available room nights/);
  assert.match(text, /accommodation revenue ÷ occupied room nights/);
  assert.match(text, /accommodation revenue ÷ available room nights/);
  // The worked example: 2 rooms x 30 nights = 60 available; 24 occupied; ₹72,000 accommodation revenue.
  assert.equal(occupancyPercent(24, 60), 40);
  assert.equal(averageDailyRate(72000, 24), 3000);
  assert.equal(revPar(72000, 60), 1200);
  assert.equal(revPar(72000, 60), (averageDailyRate(72000, 24) * occupancyPercent(24, 60)) / 100);
  for (const figure of ["60", "40%", "24", "₹72,000", "₹3,000", "₹1,200"])
    assert.ok(text.includes(figure), `example is missing ${figure}`);
});

test("Revenue, Collected and Outstanding lesson matches the app's definitions", () => {
  const text = allText(EDUCATION_LESSONS.find((x) => x.id === "revenue-vs-collected")!);
  assert.match(text, /confirmed and completed/);
  assert.match(text, /Pending and cancelled stays never count/);
  assert.match(text, /not payments/);
  assert.match(text, /not cash that arrived during the period/);
  assert.match(text, /unpaid balance/);
  assert.equal(100000 - 60000, 40000, "the example's Outstanding");
});

test("Estimated operating profit is Revenue minus recorded expenses, and is not called accounting profit", () => {
  const text = allText(EDUCATION_LESSONS.find((x) => x.id === "expenses-profit")!);
  assert.match(text, /Revenue minus the expenses you recorded/);
  assert.match(text, /not accounting profit/);
  assert.equal(estimatedOperatingProfit(100000, 40000), 60000);
});

test("no lesson sends an owner to a retired or invented screen by name or path", () => {
  for (const l of EDUCATION_LESSONS) {
    const text = allText(l);
    assert.ok(!text.includes("/admin/pricing"), `${l.id} mentions the retired pricing URL`);
    assert.ok(
      !/\bPricing page\b/.test(text),
      `${l.id} mentions a Pricing page that does not exist`,
    );
    assert.ok(
      !/\bGuests (screen|page|tab)\b/.test(text),
      `${l.id} mentions a Guests screen that does not exist`,
    );
    assert.ok(
      !/\bSources (screen|page|tab)\b/.test(text),
      `${l.id} mentions a Sources screen that does not exist`,
    );
  }
});

// ── content review guards (keep lessons short, honest and consistent) ───────

test("lessons stay short: 280 words or fewer each", () => {
  for (const l of EDUCATION_LESSONS) {
    const words = allText(l).split(/\s+/).filter(Boolean).length;
    assert.ok(words <= 280, `${l.id} is ${words} words`);
  }
});

test("no lesson promises a result", () => {
  const overclaim =
    /\b(guarantees?|guaranteed|definitely|certainly|for sure|always works|never fails)\b|\bwill (?:definitely |certainly )?(?:increase|boost|double|raise|fill|earn)\b/i;
  for (const l of EDUCATION_LESSONS) {
    const hit = allText(l).match(overclaim);
    assert.equal(hit, null, `${l.id} overclaims: "${hit?.[0]}"`);
  }
});

test("Estimated operating profit is not described as ignoring tax (Property tax is an expense category)", () => {
  const text = allText(EDUCATION_LESSONS.find((x) => x.id === "expenses-profit")!);
  assert.ok(!/ignores tax/i.test(text));
  assert.match(text, /Property tax/);
  assert.match(text, /Revenue is the value of stays, not the money received/);
});

test("repeat guest is explained the way the Monthly report defines it, and the source label is not confused with it", () => {
  const report = allText(EDUCATION_LESSONS.find((x) => x.id === "monthly-report")!);
  assert.match(report, /more than one confirmed or completed stay/);
  assert.match(report, /matched by phone number/);
  assert.match(report, /not identified/);
  const sources = allText(EDUCATION_LESSONS.find((x) => x.id === "booking-sources")!);
  assert.match(sources, /Repeat guest/);
  assert.match(sources, /only a label|your own note/);
});

test("the Monthly report is described as comparing with the previous month, not last year", () => {
  for (const id of ["seasonal-pricing", "occupancy-adr-revpar"]) {
    const text = allText(EDUCATION_LESSONS.find((x) => x.id === id)!);
    assert.ok(
      !/last year/i.test(text.replace(/busiest periods last year/i, "")),
      `${id} compares with last year`,
    );
  }
});

test("payment advice quotes the app's real advance wording (25% advance, balance on arrival)", () => {
  const text = allText(EDUCATION_LESSONS.find((x) => x.id === "outstanding-payments")!);
  assert.match(text, /25% advance/);
  assert.match(text, /balance on arrival/);
  assert.ok(!/confirms by itself/i.test(text), "the old auto-confirm claim is gone");
});
