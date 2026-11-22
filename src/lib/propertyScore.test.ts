/**
 * Unit tests for propertyScore.ts.
 *   npx tsx --test src/lib/propertyScore.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BAND_MESSAGES,
  CATEGORY_MAX,
  CATEGORY_ORDER,
  NOT_MEASURED,
  bandFor,
  categoryProgress,
  computePropertyScore,
  pointsFor,
  summariseActivity,
  type ActivitySummary,
  type ScoreProperty,
  type ScoreRoom,
  type ScoreSignals,
} from "./propertyScore";

const TODAY = "2026-11-20";
const long = "A quiet hill stay among tea gardens with mountain views.".padEnd(60, ".");

const goodRoom = (over: Partial<ScoreRoom> = {}): ScoreRoom => ({
  is_active: true,
  base_price: 2500,
  weekend_multiplier: 1.2,
  max_guests: 2,
  max_occupancy: 4,
  extra_guest_price: 500,
  room_amenities: ["wifi", "geyser"],
  images: ["https://img/1.jpg"],
  ...over,
});

const FULL: ScoreProperty = {
  name: "Hill View",
  description: long,
  hero_image: "https://img/hero.jpg",
  about_image: "https://img/about.jpg",
  logo_url: "https://img/logo.png",
  gallery_images: ["a", "b", "c", "d", "e"],
  location_lat: 10.1,
  location_lng: 77.1,
  shared_amenities: [
    "Parking",
    "Wi-Fi",
    "Garden",
    "Fire pit",
    "Kitchen",
    "__upi:hill%40bank",
    "__cancel:Free%20until%207%20days",
  ],
  owner_whatsapp: "+91 98765 43210",
  check_in_time: "14:00",
  check_out_time: "11:00",
  instagram_handle: "hillview",
  is_active: true,
  subscription_status: "active",
  rooms: [goodRoom(), goodRoom()],
};

const ACTIVITY_FULL: ActivitySummary = {
  countedStays: 4,
  startedStays: 3,
  startedWithPayment: 3,
  withPhone: 4,
  withSourceDetail: 4,
};
const SIGNALS_FULL: ScoreSignals = {
  today: TODAY,
  seasonRates: [{ start_date: "2026-12-20", end_date: "2027-01-05" }],
  activity: ACTIVITY_FULL,
  bookingTotal: 12,
  expenseCount: 6,
};
const SIGNALS_NEW: ScoreSignals = {
  today: TODAY,
  seasonRates: [],
  activity: {
    countedStays: 0,
    startedStays: 0,
    startedWithPayment: 0,
    withPhone: 0,
    withSourceDetail: 0,
  },
  bookingTotal: 0,
  expenseCount: 0,
};

// ── structure ───────────────────────────────────────────────────────────────
test("category maxima are 20/20/15/15/15/15 and total 100", () => {
  assert.deepEqual(CATEGORY_MAX, {
    listing: 20,
    rooms: 20,
    pricing: 15,
    booking: 15,
    operations: 15,
    growth: 15,
  });
  assert.equal(
    Object.values(CATEGORY_MAX).reduce((a, b) => a + b, 0),
    100,
  );
});

test("the item weights of every category add up to exactly its maximum", () => {
  const r = computePropertyScore(FULL, SIGNALS_FULL);
  for (const c of r.categories)
    assert.equal(
      c.items.reduce((s, i) => s + i.maxPoints, 0),
      CATEGORY_MAX[c.category],
      c.category,
    );
  assert.equal(
    r.items.reduce((s, i) => s + i.maxPoints, 0),
    100,
  );
  assert.equal(new Set(r.items.map((i) => i.id)).size, r.items.length);
});

test("every item carries what the UI needs: category, points, max, completed, action", () => {
  for (const i of computePropertyScore(FULL, SIGNALS_FULL).items) {
    assert.ok(CATEGORY_ORDER.includes(i.category));
    assert.equal(typeof i.points, "number");
    assert.equal(typeof i.maxPoints, "number");
    assert.equal(typeof i.completed, "boolean");
    assert.ok(i.action.length > 0);
    assert.equal(typeof i.improvement, "number");
  }
});

test("things the repository cannot measure are listed, not scored", () => {
  assert.deepEqual(NOT_MEASURED.map((n) => n.id).sort(), [
    "calendar_maintained",
    "direct_usage",
    "repeat_guests",
    "reviews",
  ]);
  const ids = computePropertyScore(FULL, SIGNALS_FULL)
    .items.map((i) => i.id)
    .join(" ");
  for (const n of NOT_MEASURED) assert.ok(!ids.includes(n.id));
});

// ── empty / new property ────────────────────────────────────────────────────
test("empty property: score 0, never negative, never NaN", () => {
  for (const p of [null, undefined, {}] as const) {
    const r = computePropertyScore(p, { today: TODAY });
    assert.equal(r.score, 0);
    assert.ok(Number.isInteger(r.score));
  }
});

test("a brand-new property (name only) scores 0 but gives useful next steps, not an empty card", () => {
  const r = computePropertyScore({ name: "New Stay", rooms: [] }, SIGNALS_NEW);
  assert.equal(r.score, 2); // only the name is done: 2 of the 82 measurable points
  assert.equal(r.band, "new");
  assert.equal(r.message, BAND_MESSAGES.new);
  assert.equal(r.topActions.length, 3);
  // Setup first: add a room, then the most valuable listing/booking basics. Nothing that needs a room.
  assert.deepEqual(
    r.topActions.map((a) => a.id),
    ["rooms_active", "listing_hero", "booking_upi"],
  );
  assert.ok(r.topActions.every((a) => a.improvement > 0 && a.href));
});

test("brand-new property: what cannot be judged yet is excluded, not counted against the owner", () => {
  const r = computePropertyScore({ name: "New Stay" }, SIGNALS_NEW);
  assert.deepEqual(r.unavailable.map((u) => u.id).sort(), [
    "growth_source",
    "ops_contacts",
    "ops_payments",
    "pricing_upcoming",
  ]);
  assert.equal(r.measurablePoints, 100 - 7 - 4 - 5 - 2);
});

test("without an active room, room-dependent items are never recommended", () => {
  const ids = computePropertyScore({ name: "X", rooms: [] }, SIGNALS_NEW).topActions.map(
    (a) => a.id,
  );
  for (const bad of [
    "rooms_photos",
    "pricing_base",
    "pricing_weekend",
    "ops_bookings",
    "growth_expenses",
  ])
    assert.ok(!ids.includes(bad));
  const inactiveOnly = computePropertyScore(
    { name: "X", rooms: [goodRoom({ is_active: false })] },
    SIGNALS_NEW,
  );
  assert.equal(inactiveOnly.items.find((i) => i.id === "rooms_active")?.completed, false);
});

// ── fully configured ────────────────────────────────────────────────────────
test("fully configured property: 100, every item complete, nothing left to recommend", () => {
  const r = computePropertyScore(FULL, SIGNALS_FULL);
  assert.equal(r.score, 100);
  assert.equal(r.earnedPoints, 100);
  assert.equal(r.measurablePoints, 100);
  assert.ok(r.items.every((i) => i.completed && i.improvement === 0));
  assert.deepEqual(r.topActions, []);
  assert.deepEqual(r.unavailable, []);
  assert.equal(r.band, "excellent");
});

// ── partially configured: exact expected numbers ────────────────────────────
const PARTIAL: ScoreProperty = {
  name: "Hill View",
  description: long,
  hero_image: "h.jpg",
  logo_url: "l.png",
  gallery_images: ["a", "b"], // 2 of 5 → floor(3 × 0.4) = 1
  location_lat: 10,
  location_lng: 77,
  shared_amenities: ["Parking", "Wi-Fi", "Garden", "__upi:x%40bank"], // 3 of 5 → floor(2 × 0.6) = 1
  owner_whatsapp: "9876543210",
  check_in_time: "14:00",
  check_out_time: "11:00",
  is_active: true,
  subscription_status: "active",
  rooms: [goodRoom({ room_amenities: ["wifi"] }), goodRoom({ is_active: false, images: [] })], // second room ignored
};
const PARTIAL_SIGNALS: ScoreSignals = {
  today: TODAY,
  seasonRates: [
    { start_date: "2026-01-01", end_date: "2026-01-10", season: { recurs_yearly: true } },
  ],
  activity: {
    countedStays: 4,
    startedStays: 2,
    startedWithPayment: 1,
    withPhone: 4,
    withSourceDetail: 1,
  },
  bookingTotal: 5,
  expenseCount: 0,
};

test("partially configured property: exact points per category", () => {
  const r = computePropertyScore(PARTIAL, PARTIAL_SIGNALS);
  const by = Object.fromEntries(r.categories.map((c) => [c.category, c.points]));
  assert.deepEqual(by, {
    listing: 15,
    rooms: 20,
    pricing: 15,
    booking: 12,
    operations: 12,
    growth: 1,
  });
  assert.equal(r.score, 75);
  assert.equal(r.band, "good");
  assert.equal(r.message, "You're doing well.");
});

test("partially configured property: top 3 actions are the biggest gains, best first", () => {
  const r = computePropertyScore(PARTIAL, PARTIAL_SIGNALS);
  assert.deepEqual(
    r.topActions.map((a) => [a.id, a.improvement]),
    [
      ["growth_source", 6],
      ["growth_expenses", 5],
      ["booking_cancel", 3], // ties at 3 break by category order: booking before operations before growth
    ],
  );
  assert.equal(r.topActions[0].scoreAfter, 81);
  assert.ok(r.topActions.every((a, i, all) => i === 0 || all[i - 1].improvement >= a.improvement));
});

test("partial credit is whole points and 'completed' means completely done", () => {
  const r = computePropertyScore(PARTIAL, PARTIAL_SIGNALS);
  const gallery = r.items.find((i) => i.id === "listing_gallery")!;
  assert.equal(gallery.points, 1);
  assert.equal(gallery.completed, false);
  assert.equal(gallery.action, "Add gallery photos (2 of 5)");
  const payments = r.items.find((i) => i.id === "ops_payments")!;
  assert.equal(payments.points, 2); // floor(5 × 1/2)
  assert.equal(payments.action, "Record payments on 1 started stay");
});

test("room items count only active rooms, as a share of them", () => {
  const rooms = [goodRoom(), goodRoom({ images: [] }), goodRoom({ images: [] })]; // 1 of 3 has a photo
  const r = computePropertyScore({ ...FULL, rooms }, SIGNALS_FULL);
  const photos = r.items.find((i) => i.id === "rooms_photos")!;
  assert.equal(photos.points, 2); // floor(6 / 3)
  assert.equal(photos.action, "Add photos to 2 of 3 rooms");
});

// ── boundaries ──────────────────────────────────────────────────────────────
test("pointsFor boundaries", () => {
  assert.equal(pointsFor(6, 0), 0);
  assert.equal(pointsFor(6, 1), 6);
  assert.equal(pointsFor(6, 0.5), 3);
  assert.equal(pointsFor(6, 2 / 3), 4); // no float drift down to 3
  assert.equal(pointsFor(6, 0.999), 5); // almost is not done
  assert.equal(pointsFor(6, 7), 6);
  assert.equal(pointsFor(6, -1), 0);
  assert.equal(pointsFor(6, Number.NaN), 0);
  assert.equal(pointsFor(6, Number.POSITIVE_INFINITY), 0); // garbage earns nothing, never full marks
});

test("band thresholds: 24/25, 49/50, 74/75, 89/90", () => {
  assert.deepEqual([0, 24, 25, 49, 50, 74, 75, 89, 90, 100].map(bandFor), [
    "new",
    "new",
    "starting",
    "starting",
    "fair",
    "fair",
    "good",
    "good",
    "excellent",
    "excellent",
  ]);
});

test("description: 49 characters fall short, 50 count", () => {
  const score = (d: string) =>
    computePropertyScore({ ...FULL, description: d }, SIGNALS_FULL).items.find(
      (i) => i.id === "listing_description",
    )!.completed;
  assert.equal(score("x".repeat(49)), false);
  assert.equal(score("x".repeat(50)), true);
  assert.equal(score("   " + "x".repeat(47) + "   "), false); // spaces do not count
});

test("gallery 4 vs 5 photos, WhatsApp 9 vs 10 digits", () => {
  const g = (n: number) =>
    computePropertyScore({ ...FULL, gallery_images: Array(n).fill("u") }, SIGNALS_FULL).items.find(
      (i) => i.id === "listing_gallery",
    )!;
  assert.equal(g(4).completed, false);
  assert.equal(g(5).completed, true);
  assert.equal(g(9).points, 3);
  const w = (v: string) =>
    computePropertyScore({ ...FULL, owner_whatsapp: v }, SIGNALS_FULL).items.find(
      (i) => i.id === "booking_whatsapp",
    )!.completed;
  assert.equal(w("98765 4321"), false);
  assert.equal(w("98765 43210"), true);
});

test("seasonal prices cover the next 90 days: day 90 yes, day 91 no, ended yesterday no, yearly always", () => {
  const up = (rate: {
    start_date: string;
    end_date: string;
    season?: { recurs_yearly: boolean };
  }) =>
    computePropertyScore(FULL, { ...SIGNALS_FULL, seasonRates: [rate] }).items.find(
      (i) => i.id === "pricing_upcoming",
    )!;
  assert.equal(up({ start_date: "2027-02-18", end_date: "2027-02-25" }).completed, true); // today + 90
  assert.equal(up({ start_date: "2027-02-19", end_date: "2027-02-25" }).completed, false); // today + 91
  assert.equal(up({ start_date: "2026-11-01", end_date: "2026-11-19" }).completed, false); // ended yesterday
  assert.equal(up({ start_date: "2026-11-01", end_date: "2026-11-20" }).completed, true); // ends today
  assert.equal(
    up({ start_date: "2025-01-01", end_date: "2025-01-05", season: { recurs_yearly: true } })
      .completed,
    true,
  );
});

test("occupancy configuration: extra space needs an extra-guest price; max below included guests is invalid", () => {
  const ok = (room: ScoreRoom) =>
    computePropertyScore({ ...FULL, rooms: [room] }, SIGNALS_FULL).items.find(
      (i) => i.id === "rooms_occupancy",
    )!.completed;
  assert.equal(ok(goodRoom()), true);
  assert.equal(ok(goodRoom({ max_occupancy: null, extra_guest_price: 0 })), true);
  assert.equal(ok(goodRoom({ max_occupancy: 2, extra_guest_price: 0 })), true);
  assert.equal(ok(goodRoom({ max_occupancy: 4, extra_guest_price: 0 })), false);
  assert.equal(ok(goodRoom({ max_occupancy: 1 })), false);
  assert.equal(ok(goodRoom({ max_guests: 0 })), false);
});

test("UPI / cancellation sentinels: present counts, empty value does not", () => {
  const item = (shared: string[], id: string) =>
    computePropertyScore({ ...FULL, shared_amenities: shared }, SIGNALS_FULL).items.find(
      (i) => i.id === id,
    )!.completed;
  assert.equal(item(["__upi:a%40b"], "booking_upi"), true);
  assert.equal(item(["__upi:"], "booking_upi"), false);
  assert.equal(item([], "booking_upi"), false);
  assert.equal(item(["__cancel:Flexible"], "booking_cancel"), true);
  // config entries are not amenities
  assert.equal(
    item(["__upi:a%40b", "__cancel:x", "__theme:y", "__rules:z", "__meals:m"], "listing_amenities"),
    false,
  );
});

test("booking page: live only when active AND activated; the owner cannot fix it, so it is never recommended", () => {
  const r = computePropertyScore({ ...FULL, subscription_status: "trial" }, SIGNALS_FULL);
  const page = r.items.find((i) => i.id === "booking_page")!;
  assert.equal(page.completed, false);
  assert.equal(page.actionable, false);
  assert.equal(page.href, undefined);
  assert.equal(r.score, 97);
  assert.ok(!r.topActions.some((a) => a.id === "booking_page"));
  assert.equal(
    computePropertyScore({ ...FULL, is_active: false }, SIGNALS_FULL).items.find(
      (i) => i.id === "booking_page",
    )!.completed,
    false,
  );
});

// ── unavailable data is not a penalty ───────────────────────────────────────
test("when bookings and expenses could not be loaded, a fully set-up property is still 100", () => {
  const r = computePropertyScore(FULL, { today: TODAY, seasonRates: SIGNALS_FULL.seasonRates });
  assert.equal(r.score, 100);
  assert.deepEqual(r.unavailable.map((u) => u.id).sort(), [
    "growth_expenses",
    "growth_source",
    "ops_bookings",
    "ops_contacts",
    "ops_payments",
  ]);
  assert.equal(r.measurablePoints, 100 - 6 - 5 - 4 - 7 - 5);
  assert.ok(r.unavailable.every((u) => u.reason.length > 0));
});

test("unavailable items earn nothing and are never recommended", () => {
  const r = computePropertyScore(FULL, { today: TODAY });
  for (const id of ["ops_bookings", "growth_expenses", "pricing_seasons"]) {
    const i = r.items.find((x) => x.id === id)!;
    assert.equal(i.available, false);
    assert.equal(i.points, 0);
    assert.equal(i.improvement, 0);
    assert.ok(!r.topActions.some((a) => a.id === id));
  }
});

test("improvement is expressed in score points even when some items are unavailable", () => {
  const r = computePropertyScore(
    { ...FULL, hero_image: "" },
    { today: TODAY, seasonRates: SIGNALS_FULL.seasonRates },
  ); // measurable 73
  const hero = r.items.find((i) => i.id === "listing_hero")!;
  assert.equal(hero.improvement, Math.round(4 * (100 / 73)));
  assert.equal(r.score, Math.round((69 * 100) / 73));
});

// ── cannot exceed 100 / go below 0 ──────────────────────────────────────────
test("score never exceeds 100, whatever the input", () => {
  const huge: ScoreProperty = {
    ...FULL,
    gallery_images: Array(500).fill("u"),
    shared_amenities: [...Array(500).fill("A"), "__upi:u", "__cancel:c"],
    rooms: Array(50).fill(
      goodRoom({
        images: Array(99).fill("i"),
        room_amenities: Array(99).fill("a"),
        base_price: 1e12,
        weekend_multiplier: 99,
      }),
    ),
  };
  const r = computePropertyScore(huge, {
    ...SIGNALS_FULL,
    bookingTotal: 1e9,
    expenseCount: 1e9,
    activity: {
      countedStays: 9,
      startedStays: 9,
      startedWithPayment: 99,
      withPhone: 99,
      withSourceDetail: 99,
    },
  });
  assert.equal(r.score, 100);
  assert.ok(r.earnedPoints <= 100);
  assert.ok(r.topActions.every((a) => a.scoreAfter <= 100));
  for (const c of r.categories) assert.ok(c.points <= c.maxPoints);
  for (const i of r.items) assert.ok(i.points <= i.maxPoints);
});

test("score never goes below 0: garbage, negatives, NaN and nulls", () => {
  const garbage = {
    name: null,
    description: null,
    gallery_images: null,
    shared_amenities: null,
    location_lat: null,
    rooms: [
      {
        is_active: true,
        base_price: -500,
        weekend_multiplier: "abc",
        max_guests: -1,
        max_occupancy: Number.NaN,
        extra_guest_price: -1,
        room_amenities: null,
        images: null,
      },
      { is_active: null, base_price: null },
    ],
  } as unknown as ScoreProperty;
  const r = computePropertyScore(garbage, {
    today: TODAY,
    activity: {
      countedStays: 3,
      startedStays: 3,
      startedWithPayment: -4,
      withPhone: -2,
      withSourceDetail: 0,
    },
    bookingTotal: -3,
    expenseCount: -1,
  });
  assert.ok(r.score >= 0 && r.score <= 100);
  for (const i of r.items) assert.ok(i.points >= 0 && i.improvement >= 0);
  assert.ok(Number.isFinite(r.score));
});

test("string numbers from the database are read as numbers", () => {
  const r = computePropertyScore(
    {
      ...FULL,
      rooms: [
        goodRoom({
          base_price: "2500.00",
          weekend_multiplier: "1.20",
          max_guests: "2",
          max_occupancy: "4",
          extra_guest_price: "500.00",
        }),
      ],
    },
    SIGNALS_FULL,
  );
  assert.equal(r.score, 100);
});

// ── determinism ─────────────────────────────────────────────────────────────
test("same input, same result; the input is never modified", () => {
  const p = Object.freeze({
    ...PARTIAL,
    rooms: Object.freeze([...(PARTIAL.rooms ?? [])]),
  }) as ScoreProperty;
  const s = Object.freeze({ ...PARTIAL_SIGNALS }) as ScoreSignals;
  assert.deepEqual(computePropertyScore(p, s), computePropertyScore(p, s));
});

test("top actions: at most three, none that are complete", () => {
  const r = computePropertyScore({ name: "N" }, { today: TODAY });
  assert.ok(r.topActions.length <= 3);
  const ids = new Set(r.items.filter((i) => i.completed).map((i) => i.id));
  assert.ok(r.topActions.every((a) => !ids.has(a.id)));
});

// ── summariseActivity ───────────────────────────────────────────────────────
const st = (over: Record<string, unknown>) =>
  ({
    id: `s${Math.random()}`,
    status: "confirmed",
    check_in: "2026-11-01",
    guest_phone: "9876543210",
    advance_amount: 0,
    ...over,
  }) as never;

test("summariseActivity: confirmed and completed only; pending and cancelled ignored", () => {
  const a = summariseActivity(
    [st({}), st({ status: "completed" }), st({ status: "pending" }), st({ status: "cancelled" })],
    [],
    TODAY,
  );
  assert.equal(a.countedStays, 2);
});

test("summariseActivity: a multi-room booking counts once, from its group", () => {
  const g = {
    id: "g1",
    status: "confirmed",
    check_in: "2026-11-05",
    guest_phone: "9876543210",
    advance_amount: 1000,
  } as never;
  const rooms = [
    st({ group_id: "g1", check_in: "2026-11-05" }),
    st({ group_id: "g1", check_in: "2026-11-05" }),
  ];
  const a = summariseActivity(rooms, [g], TODAY);
  assert.deepEqual(a, {
    countedStays: 1,
    startedStays: 1,
    startedWithPayment: 1,
    withPhone: 1,
    withSourceDetail: 0,
  });
  // a room whose group was not supplied stands on its own
  assert.equal(summariseActivity(rooms, [], TODAY).countedStays, 2);
});

test("summariseActivity: started, paid, phone and source", () => {
  const a = summariseActivity(
    [
      st({ check_in: "2026-11-20", advance_amount: 500, booking_source_detail: "instagram" }), // starts today, paid
      st({ check_in: "2026-11-21" }), // tomorrow: not started
      st({ check_in: "2026-11-02", is_paid: true, guest_phone: "12345" }), // started, paid flag, short phone
      st({ check_in: "2026-11-03", booking_source_detail: "  " }), // started, unpaid, blank source
    ],
    [],
    TODAY,
  );
  assert.deepEqual(a, {
    countedStays: 4,
    startedStays: 3,
    startedWithPayment: 2,
    withPhone: 3,
    withSourceDetail: 1,
  });
});

test("summariseActivity on nothing is all zeros", () => {
  assert.deepEqual(summariseActivity([], [], TODAY), {
    countedStays: 0,
    startedStays: 0,
    startedWithPayment: 0,
    withPhone: 0,
    withSourceDetail: 0,
  });
});

// ── hardening: the denominator is never misleading ─────────────────────────
const NO_ROOM: ScoreRoom[] = [];
const INACTIVE_ONLY: ScoreRoom[] = [goodRoom({ is_active: false })];
const BARE_ROOM: ScoreRoom[] = [
  { is_active: true, base_price: 0, max_guests: 2, images: [], room_amenities: [] },
];
const GOOD_ROOMS: ScoreRoom[] = [goodRoom(), goodRoom()];
const BARE_LISTING: ScoreProperty = { name: "Bare" };
const BARE_BOOKING: ScoreProperty = {
  check_in_time: "",
  check_out_time: "",
  shared_amenities: [],
  owner_whatsapp: "",
  is_active: true,
  subscription_status: "trial",
};

/** Every combination of the setups below: a broad, deterministic sweep (no randomness). */
function scenarios(): { name: string; property: ScoreProperty; signals: ScoreSignals }[] {
  const out: { name: string; property: ScoreProperty; signals: ScoreSignals }[] = [];
  const roomSets = { NO_ROOM, INACTIVE_ONLY, BARE_ROOM, GOOD_ROOMS };
  const listings = { fullListing: FULL, bareListing: BARE_LISTING };
  const bookings = { fullBooking: {}, bareBooking: BARE_BOOKING };
  const signalSets = {
    full: SIGNALS_FULL,
    new: SIGNALS_NEW,
    missing: { today: TODAY } as ScoreSignals,
    noActivity: { ...SIGNALS_FULL, activity: null } as ScoreSignals,
    noRates: { ...SIGNALS_FULL, seasonRates: null } as ScoreSignals,
    pastRates: {
      ...SIGNALS_FULL,
      seasonRates: [{ start_date: "2025-01-01", end_date: "2025-02-01" }],
    } as ScoreSignals,
  };
  for (const [rn, rooms] of Object.entries(roomSets))
    for (const [ln, listing] of Object.entries(listings))
      for (const [bn, booking] of Object.entries(bookings))
        for (const [sn, signals] of Object.entries(signalSets))
          out.push({
            name: `${rn}/${ln}/${bn}/${sn}`,
            property: { ...listing, ...booking, rooms },
            signals,
          });
  return out;
}

test("sweep: the score is always an integer 0–100 computed on the measurable points only", () => {
  const all = scenarios();
  assert.equal(all.length, 4 * 2 * 2 * 6);
  for (const { name, property, signals } of all) {
    const r = computePropertyScore(property, signals);
    assert.ok(Number.isInteger(r.score) && r.score >= 0 && r.score <= 100, name);
    const earned = r.items.reduce((a, i) => a + i.points, 0);
    const measurable = r.items.reduce((a, i) => a + (i.available ? i.maxPoints : 0), 0);
    assert.equal(r.earnedPoints, earned, name);
    assert.equal(r.measurablePoints, measurable, name);
    assert.equal(r.score, Math.round((earned * 100) / measurable), name);
    // categories add back up to the same numerator and denominator the score used
    assert.equal(
      r.categories.reduce((a, c) => a + c.points, 0),
      earned,
      name,
    );
    assert.equal(
      r.categories.reduce((a, c) => a + c.measurablePoints, 0),
      measurable,
      name,
    );
  }
});

test("sweep: the denominator can never shrink to something misleading (at least 65 of 100 always measurable)", () => {
  // Listing 20 + rooms 20 + booking readiness 15 + base and weekend pricing 10 never depend on loaded data.
  for (const { name, property, signals } of scenarios()) {
    const m = computePropertyScore(property, signals).measurablePoints;
    assert.ok(m >= 65 && m <= 100, `${name}: ${m}`);
  }
});

test("sweep: unavailable items earn nothing, promise nothing and are never recommended", () => {
  for (const { name, property, signals } of scenarios()) {
    const r = computePropertyScore(property, signals);
    const top = new Set(r.topActions.map((a) => a.id));
    for (const i of r.items.filter((x) => !x.available)) {
      assert.equal(i.points, 0, `${name} ${i.id}`);
      assert.equal(i.improvement, 0, `${name} ${i.id}`);
      assert.equal(i.completed, false, `${name} ${i.id}`);
      assert.ok(!top.has(i.id), `${name} ${i.id}`);
      assert.ok(i.unavailableReason, `${name} ${i.id}`);
    }
    assert.deepEqual(
      r.unavailable.map((u) => u.id),
      r.items.filter((i) => !i.available).map((i) => i.id),
      name,
    );
  }
});

test("the full score is reached only when every MEASURABLE item is done: unmeasured data never blocks or fakes 100", () => {
  const r = computePropertyScore(FULL, { today: TODAY, seasonRates: SIGNALS_FULL.seasonRates });
  assert.equal(r.score, 100);
  assert.ok(r.items.filter((i) => i.available).every((i) => i.completed));
  // …and a missing signal cannot lift an otherwise bare property above its real standing
  const bare = computePropertyScore(BARE_LISTING, { today: TODAY });
  assert.ok(bare.score <= 5);
});

test("categoryProgress: measurable denominator, never the nominal maximum", () => {
  const r = computePropertyScore({ name: "New Stay", rooms: [] }, SIGNALS_NEW);
  const ops = r.categories.find((c) => c.category === "operations")!;
  assert.equal(ops.maxPoints, 15); // nominal
  assert.deepEqual(categoryProgress(ops), { earned: 0, measurable: 6, share: 0, counted: true }); // only "bookings recorded" is measurable yet
  const growth = r.categories.find((c) => c.category === "growth")!;
  assert.equal(categoryProgress(growth).measurable, 8); // expenses 5 + Instagram 3 (source needs a booking first)
  const listing = r.categories.find((c) => c.category === "listing")!;
  assert.deepEqual(categoryProgress(listing), {
    earned: 2,
    measurable: 20,
    share: 0.1,
    counted: true,
  });
});

test("categoryProgress: a category with nothing measurable is 'not counted', not 0 of something", () => {
  const r = computePropertyScore(FULL, { today: TODAY }); // bookings could not be loaded
  const ops = r.categories.find((c) => c.category === "operations")!;
  assert.deepEqual(categoryProgress(ops), { earned: 0, measurable: 0, share: 0, counted: false });
  assert.deepEqual(categoryProgress({ points: 5, measurablePoints: -3 }), {
    earned: 0,
    measurable: 0,
    share: 0,
    counted: false,
  });
  assert.deepEqual(categoryProgress({ points: 99, measurablePoints: 10 }), {
    earned: 10,
    measurable: 10,
    share: 1,
    counted: true,
  });
});

// ── hardening: top 3 are genuinely owner-fixable ───────────────────────────
test("sweep: every recommendation is something the owner can do, on a page they can open", () => {
  for (const { name, property, signals } of scenarios()) {
    const r = computePropertyScore(property, signals);
    assert.ok(r.topActions.length <= 3, name);
    assert.equal(new Set(r.topActions.map((a) => a.id)).size, r.topActions.length, name);
    for (const a of r.topActions) {
      const item = r.items.find((i) => i.id === a.id)!;
      assert.ok(item.actionable, `${name} ${a.id}`);
      assert.ok(item.available && !item.completed, `${name} ${a.id}`);
      assert.ok(a.href && a.href.startsWith("/admin/"), `${name} ${a.id}`);
      assert.ok(a.action.length > 0 && a.improvement > 0 && a.scoreAfter <= 100, `${name} ${a.id}`);
      assert.notEqual(a.id, "booking_page", name); // platform-controlled
    }
    // best first
    for (let i = 1; i < r.topActions.length; i++)
      assert.ok(r.topActions[i - 1].improvement >= r.topActions[i].improvement, name);
  }
});

test("sweep: with no active room only setup actions are recommended, never outcomes", () => {
  const afterSetup = new Set([
    "rooms_photos",
    "rooms_occupancy",
    "rooms_amenities",
    "pricing_base",
    "pricing_weekend",
    "pricing_seasons",
    "pricing_upcoming",
    "ops_bookings",
    "growth_source",
    "growth_expenses",
  ]);
  for (const { name, property, signals } of scenarios().filter(
    (s) => s.name.startsWith("NO_ROOM") || s.name.startsWith("INACTIVE_ONLY"),
  )) {
    for (const a of computePropertyScore(property, signals).topActions)
      assert.ok(!afterSetup.has(a.id), `${name} ${a.id}`);
  }
});

test("an item with no page to act on is never owner-fixable, whatever its flags", () => {
  const r = computePropertyScore({ ...FULL, subscription_status: "trial" }, SIGNALS_FULL);
  for (const i of r.items) assert.equal(i.actionable, i.id !== "booking_page", i.id);
  assert.ok(r.items.filter((i) => i.actionable).every((i) => !!i.href));
});

test("booking page stays scored (3 points) but is not recommended, even when it is the biggest gap", () => {
  const r = computePropertyScore({ ...FULL, subscription_status: "suspended" }, SIGNALS_FULL);
  assert.equal(r.items.find((i) => i.id === "booking_page")!.maxPoints, 3);
  assert.equal(r.score, 97);
  assert.deepEqual(r.topActions, []);
});

test("bands and messages are exactly the agreed ones", () => {
  assert.deepEqual(
    [0, 24, 25, 49, 50, 74, 75, 89, 90, 100].map((n) => BAND_MESSAGES[bandFor(n)]),
    [
      "Let's get your property ready. Start with the actions below.",
      "Let's get your property ready. Start with the actions below.",
      "A good start. The actions below move your score most.",
      "A good start. The actions below move your score most.",
      "Good progress. A few changes will help.",
      "Good progress. A few changes will help.",
      "You're doing well.",
      "You're doing well.",
      "Outstanding. Your property is in great shape.",
      "Outstanding. Your property is in great shape.",
    ],
  );
});

// ── guest identity (Sprint 6): reviewed, deliberately not scored ─────────────
test("repeat guests: guests are now recognised, but repeat status stays unscored (an outcome, not setup), so the scoring is unchanged", () => {
  const repeat = NOT_MEASURED.find((n) => n.id === "repeat_guests")!;
  assert.match(repeat.reason, /recognised across bookings/);
  assert.doesNotMatch(repeat.reason, /no identity record/);
  // no item reads guests, repeat status or guest identity, and the weights still add up to exactly 100
  const r = computePropertyScore(FULL, SIGNALS_FULL);
  assert.ok(!r.items.some((i) => /repeat|guest_identity|returning/.test(i.id)));
  assert.equal(r.measurablePoints, 100);
});
