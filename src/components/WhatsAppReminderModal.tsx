import { useState } from "react";
import { X, Send } from "lucide-react";

interface Booking {
  id: string;
  guest_name: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  total_amount: number;
  room_id: string;
}

interface Props {
  bookings: Booking[];
  roomNameMap: Record<string, string>;
  property: {
    name: string;
    owner_phone: string | null;
    owner_whatsapp: string | null;
  };
  onClose: () => void;
}

type Template = "confirmed" | "reminder" | "payment" | "directions";

const TEMPLATES: { key: Template; label: string }[] = [
  { key: "confirmed",  label: "Booking confirmed" },
  { key: "reminder",  label: "Day-before reminder" },
  { key: "payment",   label: "Payment reminder" },
  { key: "directions", label: "Directions" },
];

function buildMessage(
  template: Template,
  booking: Booking,
  roomName: string,
  property: Props["property"]
): string {
  const name = booking.guest_name;
  const prop = property.name;
  const room = roomName;
  const checkIn = booking.check_in;
  const checkOut = booking.check_out;
  const phone = property.owner_phone ?? property.owner_whatsapp ?? "";
  const amount = `₹${Number(booking.total_amount).toLocaleString("en-IN")}`;

  switch (template) {
    case "confirmed":
      return `Dear ${name}, your booking at ${prop} is confirmed. Check-in: ${checkIn}. Check-out: ${checkOut}. Room: ${room}. Any questions, call us at ${phone}.`;
    case "reminder":
      return `Hi ${name}, looking forward to your arrival tomorrow at ${prop}! Check-in from 12:00 PM. Room: ${room}. Call us at ${phone} if you need anything.`;
    case "payment":
      return `Hi ${name}, friendly reminder — payment of ${amount} is pending for your stay at ${prop} on ${checkIn}. Please pay via UPI to ${phone} or call us to confirm.`;
    case "directions":
      return `Hi ${name}, here's how to reach ${prop}. Call us at ${phone} when you reach Munnar — we'll guide you from there.`;
  }
}

export function WhatsAppReminderModal({ bookings, roomNameMap, property, onClose }: Props) {
  const upcoming = bookings.filter(b => b.check_in >= new Date().toISOString().split("T")[0]);
  const [bookingId, setBookingId] = useState(upcoming[0]?.id ?? bookings[0]?.id ?? "");
  const [template, setTemplate] = useState<Template>("confirmed");

  const booking = bookings.find(b => b.id === bookingId);
  const roomName = booking ? (roomNameMap[booking.room_id] ?? "your room") : "";
  const message = booking ? buildMessage(template, booking, roomName, property) : "";
  const phone = booking?.guest_phone?.replace(/\D/g, "") ?? "";
  const waUrl = `https://wa.me/${phone.startsWith("91") ? phone : `91${phone}`}?text=${encodeURIComponent(message)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl">
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

        <div className="p-5 space-y-4">
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
                  {TEMPLATES.map(t => (
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
        <div className="flex items-center justify-end gap-3 px-5 pb-5">
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
