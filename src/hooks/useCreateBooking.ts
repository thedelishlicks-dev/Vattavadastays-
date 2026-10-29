import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getConflictingDates, pendingHoldExpiry } from "@/lib/bookingAvailability";
import { priceRoomStay } from "@/lib/quoteBuilder";
import { fetchRoomRates } from "@/hooks/useRoomRates";
import { EXTRA_GUEST_ALLOWANCE } from "@/lib/guestCount";
import { isOverlapError, OVERLAP_MESSAGE } from "@/lib/dbErrors";
import { logClientError } from "@/lib/errorLog";
import { newTrackingToken } from "@/lib/trackingToken";
import { reuseOrCreateSubmission, storedStateFromLookup, type Submission } from "@/lib/bookingSubmission";

/**
 * A random UUID for rows the browser creates itself. crypto.randomUUID() is
 * missing on older phones (Android WebView < 92, iOS < 15.4), so fall back to
 * getRandomValues, then Math.random as a last resort.
 */
function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface RoomBookingInput {
  roomId: string;
  guestCount: number; // guests assigned to this specific room
}

export interface CreateBookingInput {
  propertyId: string;
  /** For single-room bookings, pass one item. For group bookings, pass multiple. */
  rooms: RoomBookingInput[];
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  /** Total guest count across all rooms */
  totalGuests: number;
  checkIn: string;  // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  paymentMethod?: "UPI" | "Bank Transfer" | "Cash on Arrival";
  /** Property's check-in/check-out times, used to determine whether
   * same-day turnover is safe (see isSameDayTurnoverSafe). Pass these
   * through from useProperty() rather than re-fetching here. */
  propertyCheckInTime?: string | null;
  propertyCheckOutTime?: string | null;
  /** Property's owner-configurable pending-hold window (Settings page).
   * Pass through from useProperty(); falls back to the 24h default inside
   * pendingHoldExpiry() if omitted. */
  propertyPendingHoldHours?: number | null;
}

export interface RoomBookingResult {
  bookingId: string;
  roomId: string;
  roomName: string;
  totalAmount: number;
  roomPrice: number;
  extraGuestCharge: number;
}

export interface CreateBookingResult {
  /** The first booking's ID — used as the primary reference shown to the guest */
  bookingId: string;
  /** Short group reference shown to guest: first 8 chars of first booking ID */
  groupRef: string;
  totalAmount: number;
  rooms: RoomBookingResult[];
  nights: number;
  /** Secret tracking-link token, shown to the guest in their link. */
  trackingToken: string;
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  // The ids / token of the last submission, kept so tapping "Request booking" again after a lost reply
  // re-uses them (see lib/bookingSubmission.ts). Cleared once a booking is saved.
  const lastSubmission = useRef<Submission | null>(null);

  return useMutation({
    mutationFn: async (input: CreateBookingInput): Promise<CreateBookingResult> => {
      const { submission, isRetry } = reuseOrCreateSubmission(lastSubmission.current, input, {
        newId,
        newToken: newTrackingToken,
        newGroupRef: () => "GRP-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
      });
      lastSubmission.current = submission;

      // A retry: the first attempt may have reached the server even though its reply was lost. Ask by
      // the secret token (the only read a guest has). If it is there, do not re-check availability
      // (the dates now hold this very booking) or insert it again — carry on to the confirmation.
      let stored = { groupSaved: false, bookingsSaved: false };
      if (isRetry) {
        const { data, error } = await supabase.rpc("lookup_booking_by_token", { p_token: submission.trackingToken });
        if (!error) stored = storedStateFromLookup(data);
      }

      const checkIn = new Date(input.checkIn);
      const checkOut = new Date(input.checkOut);
      const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000);

      if (nights < 1) throw new Error("Check-out must be after check-in.");

      // Build the list of dates for the stay
      const dates: string[] = [];
      for (let i = 0; i < nights; i++) {
        const d = new Date(checkIn);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().split("T")[0]);
      }

      const roomIds = input.rooms.map((r) => r.roomId);

      // ── Step 1: Load all rooms' details in one query ──
      const { data: roomDetails, error: roomsErr } = await supabase
        .from("rooms")
        .select("id, name, base_price, extra_guest_price, weekend_multiplier, max_guests")
        .in("id", roomIds)
        .eq("is_active", true);

      if (roomsErr || !roomDetails) {
        logClientError({ source: "booking", error: roomsErr, message: "Could not load room details", context: { step: "load-rooms" } });
        throw new Error("Could not load room details.");
      }

      // Validate guest counts per room.
      // max_guests is the number of guests INCLUDED in the base price, not
      // a hard cap — guests can exceed it up to EXTRA_GUEST_ALLOWANCE more,
      // charged at extra_guest_price per night. This must match the ceiling
      // used by the adults stepper in RoomDetail.tsx (room.max_guests + 4).
      for (const ri of input.rooms) {
        const room = roomDetails.find((r) => r.id === ri.roomId);
        if (!room) throw new Error("One or more selected rooms are no longer available.");
        const absoluteCap = room.max_guests + EXTRA_GUEST_ALLOWANCE;
        if (ri.guestCount > absoluteCap) {
          throw new Error(`"${room.name}" can host a maximum of ${absoluteCap} guests (including extras).`);
        }
      }

      // ── Step 2: Verify every room is genuinely free for every requested
      // night — checking the `bookings` table directly via
      // getConflictingDates(), not just the `availability` mirror table.
      //
      // This used to only check `availability`, which is a CACHE kept in
      // sync by markDatesUnavailable()/the upsert in Step 5 below and by
      // releaseDatesIfUnblocked() on cancellation. A cache can drift: a
      // race between two near-simultaneous bookings, a bug in whatever
      // keeps it in sync, or manual data changes could all leave it stale
      // without this check ever noticing. Reading `bookings` directly here
      // means this check can never be wrong about what's actually booked,
      // regardless of the mirror's state.
      //
      // Also applies the SAME turnover-buffer policy as the owner
      // dashboard (isSameDayTurnoverSafe, inside getConflictingDates) —
      // previously this guest-facing path had no turnover awareness at
      // all, so it could reject a valid same-day-turnover booking a
      // property's cleaning schedule actually supports, or (worse) accept
      // one a property's schedule does NOT support. Reusing the exact same
      // function the owner-side save check uses means guest and owner
      // bookings can never disagree about what counts as a conflict.
      const turnoverProperty = {
        check_in_time: input.propertyCheckInTime ?? null,
        check_out_time: input.propertyCheckOutTime ?? null,
      };
      const conflictsByRoom = stored.bookingsSaved
        ? input.rooms.map(() => [] as string[])
        : await Promise.all(
            input.rooms.map((ri) => getConflictingDates(ri.roomId, input.checkIn, input.checkOut, turnoverProperty))
          );
      for (let i = 0; i < input.rooms.length; i++) {
        const room = roomDetails.find((r) => r.id === input.rooms[i].roomId)!;
        if (conflictsByRoom[i].length > 0) {
          throw new Error(`"${room.name}" is no longer available for the selected dates. Please choose different dates.`);
        }
      }

      // Seasonal rate periods (fresh, so a price the owner just changed is used).
      // If this fails we fall back to base prices — the DB re-prices the
      // booking server-side anyway (enforce_guest_booking_terms).
      const rates = await fetchRoomRates(input.propertyId).catch(() => []);

      // ── Step 3: Calculate price per room ──
      const roomPrices: { roomId: string; roomPrice: number; extraGuestCharge: number; totalAmount: number }[] = [];

      // One shared calculator (lib/quoteBuilder.priceRoomStay) so the guest
      // total, the owner-side AddBookingModal and the Quote Builder can never
      // drift apart.
      for (const ri of input.rooms) {
        const room = roomDetails.find((r) => r.id === ri.roomId)!;
        const line = priceRoomStay({
          room: {
            id: room.id,
            name: room.name,
            base_price: Number(room.base_price),
            extra_guest_price: Number(room.extra_guest_price ?? 0),
            weekend_multiplier: Number(room.weekend_multiplier ?? 1),
            max_guests: Number(room.max_guests),
          },
          guests: ri.guestCount,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          rates,
        });

        roomPrices.push({
          roomId: ri.roomId,
          roomPrice: line.room_price,
          extraGuestCharge: line.extra_guest_charge,
          totalAmount: line.total,
        });
      }

      // ── Step 4: Insert booking(s) ──
      // Single room: plain booking, same as before.
      // Multiple rooms: create a booking_groups row first (same shape the
      // owner-side AddGroupBookingModal uses), then insert bookings with
      // group_id set so the owner dashboard renders one group card instead
      // of N separate cards.
      const grandTotal = roomPrices.reduce((sum, r) => sum + r.totalAmount, 0);
      let groupId: string | null = null;
      // Guest self-service bookings always start "pending" (awaiting
      // advance payment/owner confirmation) — same hold-expiry rule as the
      // owner-side AddBookingModal, so an abandoned guest booking doesn't
      // block these dates forever either. See pendingHoldExpiry() docs.
      const holdExpiresAt = pendingHoldExpiry(input.propertyPendingHoldHours ?? undefined);
      // One token per submission, shared by the group row and every room row,
      // so one link opens the whole stay.
      const trackingToken = submission.trackingToken;

      // IMPORTANT — anonymous guests may INSERT bookings but have no SELECT on
      // `bookings` / `booking_groups` (HANDOVER rule 10). A PostgREST insert that
      // asks for the new row back (.select()) is therefore rejected by row-level
      // security, which made every logged-out booking fail. So ids are generated
      // here and nothing is read back: the insert is "return=minimal".
      // (A signed-in owner testing their own page can read rows back, which is
      // why this went unnoticed — always test the guest page in a private tab.)
      let displayRef: string | null = null;
      if (input.rooms.length > 1) {
        groupId = submission.groupId;
        const groupRef = submission.groupRef ?? "GRP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
        displayRef = groupRef;
        const { error: groupErr } = stored.groupSaved ? { error: null } : await supabase
          .from("booking_groups")
          .insert({
            id: groupId,
            tracking_token: trackingToken,
            property_id: input.propertyId,
            group_reference: groupRef,
            guest_name: input.guestName,
            guest_phone: input.guestPhone,
            guest_email: input.guestEmail ?? null,
            guest_count: input.totalGuests,
            check_in: input.checkIn,
            check_out: input.checkOut,
            total_amount: grandTotal,
            advance_amount: 0,
            discount_amount: 0,
            status: "pending",
            payment_method: input.paymentMethod ?? "Cash on Arrival",
            is_paid: false,
            hold_expires_at: holdExpiresAt,
          });

        if (groupErr) {
          logClientError({ source: "booking", error: groupErr, message: "Could not create group booking", context: { step: "create-group" } });
          throw new Error("Could not create group booking. Please try again.");
        }
      }

      const bookingInserts = input.rooms.map((ri, idx) => {
        const pricing = roomPrices[idx];
        return {
          id: submission.bookingIds[idx],
          tracking_token: trackingToken,
          property_id: input.propertyId,
          room_id: ri.roomId,
          guest_name: input.guestName,
          guest_phone: input.guestPhone,
          guest_email: input.guestEmail ?? null,
          guest_count: ri.guestCount,
          check_in: input.checkIn,
          check_out: input.checkOut,
          room_price: pricing.roomPrice,
          extra_guest_charge: pricing.extraGuestCharge,
          total_amount: pricing.totalAmount,
          status: "pending",
          payment_method: input.paymentMethod ?? "Cash on Arrival",
          is_paid: false,
          hold_expires_at: holdExpiresAt,
          ...(groupId ? { group_id: groupId } : {}),
        };
      });

      const { error: bookingErr } = stored.bookingsSaved
        ? { error: null }
        : await supabase.from("bookings").insert(bookingInserts);

      if (bookingErr) {
        // Roll back the group row if booking insert failed, so we don't leave
        // an orphaned empty group behind.
        if (groupId) {
          await supabase.from("booking_groups").delete().eq("id", groupId);
        }
        // A DB-level overlap (two guests booking the same room at the same
        // moment) is reported clearly instead of as a generic failure.
        if (isOverlapError(bookingErr)) throw new Error(OVERLAP_MESSAGE);
        logClientError({ source: "booking", error: bookingErr, message: "Booking insert failed", context: { step: "create-booking" } });
        throw new Error("Booking failed. Please try again.");
      }

      // The nights are blocked by the database itself: the trigger
      // mark_booking_nights_unavailable() writes the availability rows when the
      // booking is inserted. (The browser used to upsert them too, but a guest
      // has no write access to `availability`, so that request was always refused.)

      // ── Build result ──
      // The DATABASE re-prices every guest booking (enforce_guest_booking_terms)
      // from the same inputs, so these figures match what it stored.
      const firstBookingId = bookingInserts[0].id;
      if (!displayRef) displayRef = `#${firstBookingId.slice(0, 8).toUpperCase()}`;

      const roomResults: RoomBookingResult[] = bookingInserts.map((b, idx) => {
        const pricing = roomPrices[idx];
        const room = roomDetails.find((r) => r.id === b.room_id)!;
        return {
          bookingId: b.id,
          roomId: b.room_id,
          roomName: room.name,
          totalAmount: pricing.totalAmount,
          roomPrice: pricing.roomPrice,
          extraGuestCharge: pricing.extraGuestCharge,
        };
      });

      lastSubmission.current = null; // saved: the next request is a new booking

      return {
        bookingId: firstBookingId,
        groupRef: displayRef,
        trackingToken,
        totalAmount: grandTotal,
        rooms: roomResults,
        nights,
      };
    },

    onSuccess: (_data, variables) => {
      variables.rooms.forEach((r) => {
        queryClient.invalidateQueries({ queryKey: ["availability", r.roomId] });
      });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["bookingGroups"] });
      queryClient.invalidateQueries({ queryKey: ["guest-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["guestAvailability"] });
    },
  });
}
