/**
 * Property Score: a 0–100 measure of how READY a property is to take bookings and how well it is set up
 * to earn from them. Pure and deterministic (no React, no Supabase, no clock, no randomness): the same
 * input always gives the same score. Tested in propertyScore.test.ts.
 *
 * Six categories, 100 points in total
 *   LISTING 20 · ROOMS 20 · PRICING 15 · BOOKING READINESS 15 · OPERATIONS 15 · GROWTH 15
 *
 * Every item
 *   - has a fixed weight (`maxPoints`; the weights of a category add up to its maximum, tested),
 *   - earns whole points: all of them when the thing is done, `floor(weight × share)` when it is done for
 *     only part of the rooms/photos/stays (so "done" always means completely done),
 *   - says what to do next (`action`) and where (`href`) when it is not done.
 *
 * Honesty rules
 *   - Nothing is invented. Only fields that exist today are read, plus the business data from the
 *     previous sprint (booking source detail, expenses).
 *   - An item that cannot be judged FROM THE DATA GIVEN (the bookings failed to load, there is no booking
 *     yet to judge payments by, no seasonal prices to be "ready" for) is `unavailable`: it earns nothing
 *     and is left out of the maximum too, so the score is `earned ÷ measurable × 100`, never a penalty
 *     for something we could not see. With all signals present the measurable total is exactly 100.
 *   - Things the repository cannot measure reliably are NOT scored at all; see NOT_MEASURED.
 *
 * Recommendations: the three incomplete, owner-fixable items worth the most score points; ties break by
 * category order, then item order.
 */

import { readSentinel } from "./onboarding";
import { countsAsStay } from "./businessMetrics";

// ── Types ───────────────────────────────────────────────────────────────────

export type ScoreCategory = "listing" | "rooms" | "pricing" | "booking" | "operations" | "growth";

export const CATEGORY_ORDER: readonly ScoreCategory[] = [
  "listing",
  "rooms",
  "pricing",
  "booking",
  "operations",
  "growth",
];

export const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  listing: "Listing",
  rooms: "Rooms",
  pricing: "Pricing",
  booking: "Booking readiness",
  operations: "Operations",
  growth: "Growth",
};

/** The fixed maximum of each category. They add up to 100 (tested). */
export const CATEGORY_MAX: Record<ScoreCategory, number> = {
  listing: 20,
  rooms: 20,
  pricing: 15,
  booking: 15,
  operations: 15,
  growth: 15,
};

/** The property fields the score reads. A Property / OwnerProperty row satisfies it. */
export interface ScoreProperty {
  name?: string | null;
  description?: string | null;
  hero_image?: string | null;
  about_image?: string | null;
  logo_url?: string | null;
  gallery_images?: readonly string[] | null;
  location_lat?: number | null;
  location_lng?: number | null;
  /** Real amenity tags AND the "__upi:" / "__cancel:" … config entries (told apart here). */
  shared_amenities?: readonly string[] | null;
  owner_whatsapp?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  instagram_handle?: string | null;
  is_active?: boolean | null;
  subscription_status?: string | null;
  rooms?: readonly ScoreRoom[] | null;
}

export interface ScoreRoom {
  is_active?: boolean | null;
  base_price?: number | string | null;
  weekend_multiplier?: number | string | null;
  max_guests?: number | string | null;
  max_occupancy?: number | string | null;
  extra_guest_price?: number | string | null;
  room_amenities?: readonly string[] | null;
  images?: readonly string[] | null;
}

/** A seasonal price rule (what useRoomRates returns): only its dates are read. */
export interface ScoreRate {
  start_date: string;
  end_date: string;
  season?: { recurs_yearly?: boolean } | null;
}

/** What the recent bookings say. Built by summariseActivity(); see below. */
export interface ActivitySummary {
  /** Confirmed or completed stays in the loaded window (a multi-room booking counts once). */
  countedStays: number;
  /** …of which have already started (check-in on or before today). */
  startedStays: number;
  /** …of those, with a payment recorded. */
  startedWithPayment: number;
  /** Counted stays with a usable guest phone number. */
  withPhone: number;
  /** Counted stays that say how the guest found the property. */
  withSourceDetail: number;
}

export interface ScoreSignals {
  /** Local date, "YYYY-MM-DD". Passed in so the score never reads the clock. */
  today: string;
  /** Seasonal price rules still current or to come. undefined/null = could not be loaded. */
  seasonRates?: readonly ScoreRate[] | null;
  /** Recent bookings. undefined/null = could not be loaded. */
  activity?: ActivitySummary | null;
  /** All bookings ever recorded (count only). undefined/null = could not be loaded. */
  bookingTotal?: number | null;
  /** Expenses recorded in the last two months. undefined/null = could not be loaded. */
  expenseCount?: number | null;
}

export interface ScoreItem {
  id: string;
  category: ScoreCategory;
  label: string;
  /** Points this item is worth. */
  maxPoints: number;
  /** Points earned (whole number, 0 when unavailable). */
  points: number;
  /** Done completely. False when unavailable. */
  completed: boolean;
  /** False when it cannot be judged from the data given: excluded from the maximum. */
  available: boolean;
  /** Why it is unavailable. */
  unavailableReason?: string;
  /** What to do next (set whenever it is not completed). */
  action: string;
  href?: string;
  /** The owner can fix it: not platform-controlled, and there is a page to do it on. Only these are recommended. */
  actionable: boolean;
  /** Only recommended once an active room exists (it still counts towards the score). Setup comes first. */
  needsRoom: boolean;
  /** Score points gained by completing it (0 when completed or unavailable). */
  improvement: number;
}

export interface RecommendedAction {
  id: string;
  category: ScoreCategory;
  action: string;
  /** Score points gained by doing it. */
  improvement: number;
  href?: string;
  /** The score once this (alone) is done, capped at 100. */
  scoreAfter: number;
}

export interface CategoryScore {
  category: ScoreCategory;
  label: string;
  /** Points earned. */
  points: number;
  /** The category's nominal maximum. */
  maxPoints: number;
  /** The part of the maximum that could be measured. */
  measurablePoints: number;
  items: ScoreItem[];
}

export type ScoreBand = "excellent" | "good" | "fair" | "starting" | "new";

export interface PropertyScoreResult {
  /** 0–100, whole number. */
  score: number;
  band: ScoreBand;
  message: string;
  earnedPoints: number;
  /** 100 when everything could be measured. */
  measurablePoints: number;
  categories: CategoryScore[];
  items: ScoreItem[];
  /** Up to three, best first. */
  topActions: RecommendedAction[];
  /** Items that could not be judged, with the reason. */
  unavailable: { id: string; label: string; reason: string }[];
}

/**
 * Things asked for but NOT scored, because the repository holds no reliable data for them. Listed here so the
 * gap is explicit instead of silently "complete":
 */
export const NOT_MEASURED: readonly { id: string; label: string; reason: string }[] = [
  {
    id: "repeat_guests",
    label: "Repeat guest tracking",
    reason:
      "Guests are now recognised across bookings (by phone, within the property), but having repeat guests " +
      "depends on how long a property has traded, not on how it is set up. Scoring it would mark new " +
      "properties down for something they cannot fix, so it is shown on the guest history instead.",
  },
  {
    id: "direct_usage",
    label: "Direct booking usage",
    reason:
      "Guest-made and owner-entered bookings are both stored as “direct”, so they cannot be told apart.",
  },
  { id: "reviews", label: "Reviews", reason: "The app stores no reviews or ratings." },
  {
    id: "calendar_maintained",
    label: "Calendar maintained",
    reason: "There is no reliable signal that a calendar is up to date.",
  },
];

// ── Tunable thresholds (named so tests and copy agree) ───────────────────────

export const DESCRIPTION_MIN_CHARS = 50;
export const GALLERY_TARGET = 5;
export const AMENITIES_TARGET = 5;
export const UPCOMING_RATES_DAYS = 90;
export const PHONE_MIN_DIGITS = 10;

// ── Small helpers ───────────────────────────────────────────────────────────

const text = (v: string | null | undefined) => (v ?? "").trim();
const num = (v: number | string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

const dayNumber = (ymd: string) => {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** Whole points for a partial result: all of `max` only when share is 1; never more, never negative. */
export function pointsFor(max: number, share: number): number {
  if (!Number.isFinite(share) || share <= 0) return 0;
  if (share >= 1) return max;
  return Math.min(max, Math.max(0, Math.floor(max * share + 1e-9)));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Real amenity tags (config entries start with "__"). */
function amenityTags(list: readonly string[] | null | undefined): string[] {
  return (list ?? []).filter((a) => !a.startsWith("__") && a.trim() !== "");
}

// ── Recent activity → ActivitySummary ───────────────────────────────────────

interface StayLike {
  id: string;
  group_id?: string | null;
  status?: string | null;
  check_in: string;
  guest_phone?: string | null;
  advance_amount?: number | string | null;
  is_paid?: boolean | null;
  booking_source_detail?: string | null;
}
type GroupStayLike = Omit<StayLike, "group_id">;

/**
 * Counts what the score needs from the bookings already loaded for the dashboard window. A multi-room
 * booking counts ONCE (its group row; room rows of a supplied group are skipped), cancelled and pending
 * stays are ignored. No money is calculated here, only "was a payment recorded".
 */
export function summariseActivity(
  bookings: readonly StayLike[],
  groups: readonly GroupStayLike[],
  today: string,
): ActivitySummary {
  const groupIds = new Set(groups.map((g) => g.id));
  const stays: GroupStayLike[] = [
    ...groups,
    ...bookings.filter((b) => !(b.group_id && groupIds.has(b.group_id))),
  ].filter((s) => countsAsStay(s.status));

  const started = stays.filter((s) => dayNumber(s.check_in) <= dayNumber(today));
  return {
    countedStays: stays.length,
    startedStays: started.length,
    startedWithPayment: started.filter((s) => num(s.advance_amount) > 0 || s.is_paid === true)
      .length,
    withPhone: stays.filter((s) => digits(s.guest_phone).length >= PHONE_MIN_DIGITS).length,
    withSourceDetail: stays.filter((s) => text(s.booking_source_detail) !== "").length,
  };
}

// ── The score ───────────────────────────────────────────────────────────────

interface Draft {
  id: string;
  category: ScoreCategory;
  label: string;
  maxPoints: number;
  /** 0..1 share done, or null when it cannot be judged. */
  share: number | null;
  unavailableReason?: string;
  action: string;
  href?: string;
  actionable?: boolean;
  needsRoom?: boolean;
}

const SETTINGS = "/admin/settings";
const ROOMS = "/admin/rooms";
const POLICIES = "/admin/policies";

function shareOf(count: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, count / total)) : 0;
}

function buildDrafts(property: ScoreProperty, signals: ScoreSignals): Draft[] {
  const rooms = (property.rooms ?? []).filter((r) => r.is_active !== false);
  const roomCount = rooms.length;
  const sharedAmenities = property.shared_amenities ?? [];
  const gallery = (property.gallery_images ?? []).filter((u) => text(u) !== "").length;
  const tags = amenityTags(sharedAmenities).length;

  const roomsWithPhoto = rooms.filter((r) => (r.images ?? []).some((u) => text(u) !== "")).length;
  const roomsPriced = rooms.filter((r) => num(r.base_price) > 0).length;
  const roomsWeekend = rooms.filter((r) => num(r.weekend_multiplier) > 1).length;
  const roomsWithAmenities = rooms.filter((r) =>
    (r.room_amenities ?? []).some((a) => text(a) !== ""),
  ).length;
  const roomsOccupancyOk = rooms.filter((r) => {
    const guests = num(r.max_guests);
    if (guests < 1) return false;
    const max = r.max_occupancy == null ? null : num(r.max_occupancy);
    if (max === null) return true;
    if (max < guests) return false;
    // Space for extra guests but no price for them: the configuration is incomplete.
    return max === guests || num(r.extra_guest_price) > 0;
  }).length;

  const activity = signals.activity ?? null;
  const rates = signals.seasonRates ?? null;
  const today = signals.today;

  const upcomingRates = rates
    ? rates.some(
        (r) =>
          r.season?.recurs_yearly === true ||
          (dayNumber(r.end_date) >= dayNumber(today) &&
            dayNumber(r.start_date) <= dayNumber(today) + UPCOMING_RATES_DAYS),
      )
    : false;

  const hasUpi = readSentinel(sharedAmenities as string[], "__upi:") !== "";
  const hasCancel = readSentinel(sharedAmenities as string[], "__cancel:") !== "";
  const pageLive = property.is_active === true && property.subscription_status === "active";

  const noRoom = "Add a room first";
  const missing = (n: number, total: number) => `${n} of ${plural(total, "room")}`;

  const drafts: Draft[] = [
    // ── LISTING (20) ──────────────────────────────────────────────────────
    {
      id: "listing_name",
      category: "listing",
      label: "Property name",
      maxPoints: 2,
      share: text(property.name) ? 1 : 0,
      action: "Add your property name",
      href: SETTINGS,
    },
    {
      id: "listing_description",
      category: "listing",
      label: "Description",
      maxPoints: 3,
      share: text(property.description).length >= DESCRIPTION_MIN_CHARS ? 1 : 0,
      action: `Write a description of at least ${DESCRIPTION_MIN_CHARS} characters`,
      href: SETTINGS,
    },
    {
      id: "listing_hero",
      category: "listing",
      label: "Hero image",
      maxPoints: 4,
      share: text(property.hero_image) ? 1 : 0,
      action: "Add a hero image",
      href: SETTINGS,
    },
    {
      id: "listing_about",
      category: "listing",
      label: "About photo",
      maxPoints: 2,
      share: text(property.about_image) ? 1 : 0,
      action: "Add an About photo",
      href: SETTINGS,
    },
    {
      id: "listing_logo",
      category: "listing",
      label: "Logo",
      maxPoints: 2,
      share: text(property.logo_url) ? 1 : 0,
      action: "Upload your logo",
      href: SETTINGS,
    },
    {
      id: "listing_gallery",
      category: "listing",
      label: "Photo gallery",
      maxPoints: 3,
      share: shareOf(gallery, GALLERY_TARGET),
      action: `Add gallery photos (${Math.min(gallery, GALLERY_TARGET)} of ${GALLERY_TARGET})`,
      href: SETTINGS,
    },
    {
      id: "listing_location",
      category: "listing",
      label: "Map location",
      maxPoints: 2,
      share: property.location_lat != null && property.location_lng != null ? 1 : 0,
      action: "Set your map location",
      href: SETTINGS,
    },
    {
      id: "listing_amenities",
      category: "listing",
      label: "Amenities",
      maxPoints: 2,
      share: shareOf(tags, AMENITIES_TARGET),
      action: `List your amenities (${Math.min(tags, AMENITIES_TARGET)} of ${AMENITIES_TARGET})`,
      href: "/admin/amenities",
    },

    // ── ROOMS (20) ────────────────────────────────────────────────────────
    {
      id: "rooms_active",
      category: "rooms",
      label: "At least one active room",
      maxPoints: 6,
      share: roomCount > 0 ? 1 : 0,
      action: "Add your first room",
      href: ROOMS,
    },
    {
      id: "rooms_photos",
      category: "rooms",
      label: "Room photos",
      maxPoints: 6,
      needsRoom: true,
      share: shareOf(roomsWithPhoto, roomCount),
      action:
        roomCount > 0 ? `Add photos to ${missing(roomCount - roomsWithPhoto, roomCount)}` : noRoom,
      href: ROOMS,
    },
    {
      id: "rooms_occupancy",
      category: "rooms",
      label: "Guest limits",
      maxPoints: 4,
      needsRoom: true,
      share: shareOf(roomsOccupancyOk, roomCount),
      action:
        roomCount > 0
          ? `Check guest limits and extra-guest price on ${missing(roomCount - roomsOccupancyOk, roomCount)}`
          : noRoom,
      href: ROOMS,
    },
    {
      id: "rooms_amenities",
      category: "rooms",
      label: "Room amenities",
      maxPoints: 4,
      needsRoom: true,
      share: shareOf(roomsWithAmenities, roomCount),
      action:
        roomCount > 0
          ? `Add amenities to ${missing(roomCount - roomsWithAmenities, roomCount)}`
          : noRoom,
      href: ROOMS,
    },

    // ── PRICING (15) ──────────────────────────────────────────────────────
    {
      id: "pricing_base",
      category: "pricing",
      label: "Base price on every room",
      maxPoints: 6,
      needsRoom: true,
      share: shareOf(roomsPriced, roomCount),
      action:
        roomCount > 0
          ? `Set a nightly price for ${missing(roomCount - roomsPriced, roomCount)}`
          : noRoom,
      href: ROOMS,
    },
    {
      id: "pricing_weekend",
      category: "pricing",
      label: "Weekend pricing",
      maxPoints: 4,
      needsRoom: true,
      share: shareOf(roomsWeekend, roomCount),
      action:
        roomCount > 0
          ? `Set weekend pricing on ${missing(roomCount - roomsWeekend, roomCount)}`
          : noRoom,
      href: ROOMS,
    },
    {
      id: "pricing_seasons",
      category: "pricing",
      label: "Seasonal pricing",
      maxPoints: 3,
      needsRoom: true,
      share: rates === null ? null : rates.length > 0 ? 1 : 0,
      unavailableReason: "Seasonal prices could not be loaded",
      action: "Add seasonal pricing for peak and quiet periods",
      href: ROOMS,
    },
    {
      id: "pricing_upcoming",
      category: "pricing",
      label: "Prices cover the next 90 days",
      maxPoints: 2,
      needsRoom: true,
      // With no seasonal prices there is nothing to be "up to date": judged by the item above instead.
      share: rates === null || rates.length === 0 ? null : upcomingRates ? 1 : 0,
      unavailableReason:
        rates === null ? "Seasonal prices could not be loaded" : "No seasonal prices yet",
      action: `Add or extend seasonal prices to cover the next ${UPCOMING_RATES_DAYS} days`,
      href: ROOMS,
    },

    // ── BOOKING READINESS (15) ────────────────────────────────────────────
    {
      id: "booking_upi",
      category: "booking",
      label: "UPI ID",
      maxPoints: 4,
      share: hasUpi ? 1 : 0,
      action: "Add your UPI ID",
      href: SETTINGS,
    },
    {
      id: "booking_cancel",
      category: "booking",
      label: "Cancellation policy",
      maxPoints: 3,
      share: hasCancel ? 1 : 0,
      action: "Set your cancellation policy",
      href: POLICIES,
    },
    {
      id: "booking_times",
      category: "booking",
      label: "Check-in and check-out times",
      maxPoints: 2,
      share: text(property.check_in_time) && text(property.check_out_time) ? 1 : 0,
      action: "Set your check-in and check-out times",
      href: POLICIES,
    },
    {
      id: "booking_page",
      category: "booking",
      label: "Booking page live",
      maxPoints: 3,
      share: pageLive ? 1 : 0,
      actionable: false,
      action: "Ask Stayidom to activate your booking page",
    },
    {
      id: "booking_whatsapp",
      category: "booking",
      label: "WhatsApp contact",
      maxPoints: 3,
      share: digits(property.owner_whatsapp).length >= PHONE_MIN_DIGITS ? 1 : 0,
      action: "Add your WhatsApp number",
      href: SETTINGS,
    },

    // ── OPERATIONS (15) ───────────────────────────────────────────────────
    {
      id: "ops_bookings",
      category: "operations",
      label: "Bookings recorded",
      maxPoints: 6,
      needsRoom: true,
      share: signals.bookingTotal == null ? null : signals.bookingTotal > 0 ? 1 : 0,
      unavailableReason: "Bookings could not be loaded",
      action: "Record your first booking",
      href: "/admin/bookings",
    },
    {
      id: "ops_payments",
      category: "operations",
      label: "Payments tracked",
      maxPoints: 5,
      share: !activity
        ? null
        : activity.startedStays === 0
          ? null
          : shareOf(activity.startedWithPayment, activity.startedStays),
      unavailableReason: !activity ? "Bookings could not be loaded" : "No stay has started yet",
      action: activity
        ? `Record payments on ${plural(activity.startedStays - activity.startedWithPayment, "started stay")}`
        : "Record payments on your bookings",
      href: "/admin/payments",
    },
    {
      id: "ops_contacts",
      category: "operations",
      label: "Guest phone numbers",
      maxPoints: 4,
      share: !activity
        ? null
        : activity.countedStays === 0
          ? null
          : shareOf(activity.withPhone, activity.countedStays),
      unavailableReason: !activity ? "Bookings could not be loaded" : "No confirmed stays yet",
      action: activity
        ? `Add a phone number to ${plural(activity.countedStays - activity.withPhone, "booking")}`
        : "Add guest phone numbers",
      href: "/admin/bookings",
    },

    // ── GROWTH (15) ───────────────────────────────────────────────────────
    {
      id: "growth_source",
      category: "growth",
      label: "Booking sources recorded",
      maxPoints: 7,
      needsRoom: true,
      share: !activity
        ? null
        : activity.countedStays === 0
          ? null
          : shareOf(activity.withSourceDetail, activity.countedStays),
      unavailableReason: !activity ? "Bookings could not be loaded" : "No confirmed stays yet",
      action: "Note how each new guest found you when you add a booking",
      href: "/admin/bookings",
    },
    {
      id: "growth_expenses",
      category: "growth",
      label: "Expenses recorded",
      maxPoints: 5,
      needsRoom: true,
      share: signals.expenseCount == null ? null : signals.expenseCount > 0 ? 1 : 0,
      unavailableReason: "Expenses could not be loaded",
      action: "Record your expenses to see profit",
      href: "/admin/expenses",
    },
    {
      id: "growth_instagram",
      category: "growth",
      label: "Instagram handle",
      maxPoints: 3,
      share: text(property.instagram_handle) ? 1 : 0,
      action: "Add your Instagram handle",
      href: SETTINGS,
    },
  ];
  return drafts;
}

/**
 * What to show for one category: points earned out of the points that could be MEASURED (not the nominal
 * maximum), so a category that is partly unmeasurable never reads as if the owner is missing points they
 * could not have earned. `counted` is false when none of the category could be measured yet.
 */
export function categoryProgress(c: Pick<CategoryScore, "points" | "measurablePoints">): {
  earned: number;
  measurable: number;
  share: number;
  counted: boolean;
} {
  const measurable = Math.max(0, c.measurablePoints);
  if (measurable === 0) return { earned: 0, measurable: 0, share: 0, counted: false };
  const earned = Math.min(Math.max(0, c.points), measurable);
  return { earned, measurable, share: earned / measurable, counted: true };
}

export function bandFor(score: number): ScoreBand {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "fair";
  if (score >= 25) return "starting";
  return "new";
}

export const BAND_MESSAGES: Record<ScoreBand, string> = {
  excellent: "Outstanding. Your property is in great shape.",
  good: "You're doing well.",
  fair: "Good progress. A few changes will help.",
  starting: "A good start. The actions below move your score most.",
  new: "Let's get your property ready. Start with the actions below.",
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function computePropertyScore(
  property: ScoreProperty | null | undefined,
  signals: ScoreSignals,
): PropertyScoreResult {
  const drafts = buildDrafts(property ?? {}, signals);

  const measurable = drafts.reduce((s, d) => s + (d.share === null ? 0 : d.maxPoints), 0);
  const scale = measurable > 0 ? 100 / measurable : 0;

  const items: ScoreItem[] = drafts.map((d) => {
    const available = d.share !== null;
    const points = available ? pointsFor(d.maxPoints, d.share as number) : 0;
    const completed = available && points === d.maxPoints;
    const remaining = available ? d.maxPoints - points : 0;
    const improvement = remaining > 0 ? Math.max(1, Math.round(remaining * scale)) : 0;
    return {
      id: d.id,
      category: d.category,
      label: d.label,
      maxPoints: d.maxPoints,
      points,
      completed,
      available,
      unavailableReason: available ? undefined : d.unavailableReason,
      action: d.action,
      href: d.href,
      // Owner-fixable = not platform-controlled AND there is a page to do it on.
      actionable: d.actionable !== false && !!d.href,
      needsRoom: d.needsRoom === true,
      improvement,
    };
  });

  const earned = items.reduce((s, i) => s + i.points, 0);
  const score = measurable > 0 ? clamp(Math.round((earned * 100) / measurable), 0, 100) : 0;

  const hasActiveRoom = items.find((i) => i.id === "rooms_active")?.completed === true;
  const order = new Map(items.map((i, idx) => [i.id, idx]));
  const catIndex = (c: ScoreCategory) => CATEGORY_ORDER.indexOf(c);
  const topActions: RecommendedAction[] = items
    .filter(
      (i) =>
        i.available &&
        !i.completed &&
        i.actionable &&
        i.improvement > 0 &&
        (!i.needsRoom || hasActiveRoom),
    )
    .sort(
      (a, b) =>
        b.improvement - a.improvement ||
        catIndex(a.category) - catIndex(b.category) ||
        (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    )
    .slice(0, 3)
    .map((i) => ({
      id: i.id,
      category: i.category,
      action: i.action,
      improvement: i.improvement,
      href: i.href,
      scoreAfter: Math.min(100, score + i.improvement),
    }));

  const categories: CategoryScore[] = CATEGORY_ORDER.map((category) => {
    const list = items.filter((i) => i.category === category);
    return {
      category,
      label: CATEGORY_LABELS[category],
      points: list.reduce((s, i) => s + i.points, 0),
      maxPoints: CATEGORY_MAX[category],
      measurablePoints: list.reduce((s, i) => s + (i.available ? i.maxPoints : 0), 0),
      items: list,
    };
  });

  const band = bandFor(score);
  return {
    score,
    band,
    message: BAND_MESSAGES[band],
    earnedPoints: earned,
    measurablePoints: measurable,
    categories,
    items,
    topActions,
    unavailable: items
      .filter((i) => !i.available)
      .map((i) => ({
        id: i.id,
        label: i.label,
        reason: i.unavailableReason ?? "Not enough data yet",
      })),
  };
}
