/**
 * Editing a booking's source AFTER it was created (Sprint 6). Pure; tested in sourceEditing.test.ts.
 *
 * The two existing fields stay as they are (no second taxonomy):
 *   - `source`  direct | agent | walk_in. Still drives agents and commissions.
 *   - `booking_source_detail`  free text, suggested values in bookingSourceDetail.ts (WhatsApp, Instagram, …).
 *
 * The patch built here can contain ONLY those two columns. It can never carry money, dates, room, status,
 * payments, the guest or the agent, so an edit cannot change revenue, payments or guest identity (the
 * guests trigger does not fire on these columns either).
 *
 * Agent bookings keep their agent and commission: their `source` is not changed here (moving a booking to or
 * from an agent needs an agent and a commission, which is a different edit). Their detail can be edited.
 */

import { bookingSourceDetailLabel } from "./bookingSourceDetail";
import type { BookingSource } from "@/types/database";

/** What the edit may write. */
export interface SourcePatch {
  source: BookingSource;
  booking_source_detail: string | null;
}

export interface SourceFields {
  source?: string | null;
  booking_source_detail?: string | null;
}

/** Sources an owner can switch a booking between. "agent" is never offered (see above). */
export const EDITABLE_SOURCES: { value: Exclude<BookingSource, "agent">; label: string }[] = [
  { value: "direct", label: "Direct" },
  { value: "walk_in", label: "Walk-in" },
];

/** Agent bookings keep their source (and so their agent and commission). */
export function canChangeSource(current: SourceFields): boolean {
  return current.source !== "agent";
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/**
 * The patch to save, or null when nothing changes. `nextDetail` "" / blank clears the detail (the primary
 * source always stays valid: it is never cleared). A source that is not a known one, or a change away from
 * "agent", is ignored and the current source is kept.
 */
export function buildSourcePatch(
  current: SourceFields,
  next: { source?: string | null; detail?: string | null },
): SourcePatch | null {
  const currentSource: BookingSource =
    current.source === "agent" || current.source === "walk_in" ? current.source : "direct";
  const wanted = next.source ?? currentSource;
  const source: BookingSource =
    canChangeSource(current) && (wanted === "direct" || wanted === "walk_in")
      ? wanted
      : currentSource;
  const detail = clean(next.detail);
  const currentDetail = clean(current.booking_source_detail);
  if (source === currentSource && detail === currentDetail) return null;
  return { source, booking_source_detail: detail };
}

const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct",
  agent: "Agent",
  walk_in: "Walk-in",
};

/**
 * One line for the booking details: "WhatsApp", "Walk-in", "Agent · Instagram", or "Not recorded" for a plain
 * direct booking with no detail. Reads exactly what is stored; never infers a source.
 */
export function sourceSummary(row: SourceFields): string {
  const detail = bookingSourceDetailLabel(row.booking_source_detail);
  const primary = SOURCE_LABELS[row.source ?? ""] ?? "Direct";
  if (row.source === "agent") return detail ? `${primary} · ${detail}` : primary;
  if (row.source === "walk_in")
    return detail && detail !== primary ? `${primary} · ${detail}` : primary;
  return detail ?? "Not recorded";
}
