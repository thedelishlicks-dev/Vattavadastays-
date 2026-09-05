import { useMemo, useState } from "react";
import { X, Send } from "lucide-react";
import {
  buildConfirmationText,
  buildDayBeforeReminderText,
  buildDirectionsText,
  buildPaymentReminderText,
  guestTrackingUrl,
  clean,
} from "@/lib/whatsapp";

interface Booking {
  id: string;
  guest_name: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  total_amount: number;
  advance_amount: number;
  discount_amount?: number | null;
  room_id: string;
  /** Extra charges tab entries, joined in via useBookings(). */
  booking_charges?: { qty: number; unit_price: number }[] | null;
}

interface Props {
  bookings: Booking[];
  roomNameMap: Record<string, string>;
  property: {
    name: string;
    owner_phone: string | null;
    owner_whatsapp: string | null;
    upiId?: string | null;
    check_in_time?: string | null;
    /** Needed for the "Directions" template — that template is hidden
     * entirely when either is missing, same rule the bookings page uses. */
    location_lat?: number | null;
    location_lng?: number | null;
    landmark_description?: string | null;
  };
  onClose: () => void;
}

type Template = "confirmed" | "reminder" | "payment" | "directions";

function buildMessage(
  template: Template,
  booking: Booking,
  roomName: string,
  property: Props["property"],
  origin: string
): string {
  const name = booking.guest_name;
  const prop = property.name;
  const checkIn = booking.check_in;
  const checkOut = booking.check_out;
  const phone = property.owner_phone ?? property.owner_whatsapp ?? "";

  switch (template) {
    // Delegates to the shared text builders so every button in this modal
    // always matches what the bookings pages actually send: same copy,
    // same tracking link, same amount math. Never hand-roll message text
    // here again — see the comments on each builder in lib/whatsapp.ts for
    // why (this modal used to drift out of sync with the real messages).
    case "confirmed":
      return buildConfirmationText({
        guestName: name,
        propertyName: prop,
        roomName,
        checkIn,
        checkOut,
        ownerPhone: phone,
        trackingUrl: guestTrackingUrl(origin, booking.guest_phone),
      });

    case "reminder":
      return buildDayBeforeReminderText({
        guestName: name,
        propertyName: prop,
        checkInTime: property.check_in_time ?? "12:00 PM",
        ownerPhone: phone,
      });

    case "payment": {
      const chargesTotal = (booking.booking_charges ?? [])
        .reduce((sum, c) => sum + c.qty * c.unit_price, 0);
      return buildPaymentReminderText({
        guestName: name,
        totalAmount: Number(booking.total_amount),
        chargesTotal,
        discount: Number(booking.discount_amount ?? 0),
        advancePaid: Number(booking.advance_amount ?? 0),
        checkIn,
        propertyName: prop,
        upiId: property.upiId ?? undefined,
        ownerPhone: phone,
        trackingUrl: guestTrackingUrl(origin, booking.guest_phone),
      });
    }

    case "directions":
      // Only reachable when location_lat/lng are present — see the
      // TEMPLATES filter below — but guard anyway in case a caller ever
      // pre-selects "directions" for a property without coordinates.
      if (property.location_lat == null || property.location_lng == null) {
        return `Hi ${name}, here's how to reach ${prop}.\n\nCall us at ${phone} when you reach — we'll guide you from there.`;
      }
      return buildDirectionsText({
        guestName: name,
        propertyName: prop,
        lat: property.location_lat,
        lng: property.location_lng,
        ownerPhone: phone,
        landmark: property.landmark_description ?? undefined,
      });
  }
}

export function WhatsAppReminderModal({ bookings, roomNameMap, property, onClose }: Props) {
  const hasCoordinates = property.location_lat != null && property.location_lng != null;

  const templates = useMemo(() => {
    const all: { key: Template; label: string }[] = [
      { key: "confirmed",  label: "Booking confirmed" },
      { key: "reminder",  label: "Day-before reminder" },
      { key: "payment",   label: "Payment reminder" },
      { key: "directions", label: "Directions" },
    ];
    // Directions needs real coordinates to build a maps link — don't offer
    // a template that can only ever fall back to "call us", same rule the
    // bookings page uses for its own Directions button.
    return hasCoordinates ? all : all.filter(t => t.key !== "directions");
  }, [hasCoordinates]);

  const upcoming = bookings.filter(b => b.check_in >= new Date().toISOString().split("T")[0]);
  const [bookingId, setBookingId] = useState(upcoming[0]?.id ?? bookings[0]?.id ?? "");
  const [template, setTemplate] = useState<Template>("confirmed");

  const booking = bookings.find(b => b.id === bookingId);
  const roomName = booking ? (roomNameMap[booking.room_id] ?? "your room") : "";
  const message = booking
    ? buildMessage(template, booking, roomName, property, window.location.origin)
    : "";
  const phone = booking ? clean(booking.guest_phone) : "";
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Send WhatsApp reminder</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings found.</p>
          ) : (
            <>
              {/* Booking picker */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Guest / booking</label>
                <select
                  value={bookingId}
                  onChange={e => setBookingId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {bookings.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.guest_name} — {b.check_in} ({roomNameMap[b.room_id] ?? "room"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Template picker */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Message type</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {templates.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setTemplate(t.key)}
                      className={[
                        "text-xs px-3 py-1.5 rounded-full border transition-colors",
                        template === t.key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-muted",
                      ].join(" ")}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message preview */}
              {booking && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</label>
                  <div className="mt-1.5 rounded-xl bg-[#dcfce7] border border-[#bbf7d0] p-4 text-sm text-[#14532d] leading-relaxed whitespace-pre-wrap">
                    {message}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Sending to: {booking.guest_phone}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 pb-5 pt-2 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-full border border-border hover:bg-muted">
            Cancel
          </button>
          {booking && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm rounded-full bg-[#25D366] text-white hover:bg-[#1ebe5d] transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              Open in WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
