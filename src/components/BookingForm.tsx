import { useState, useRef } from "react";
import { Check, ExternalLink, MessageCircle, Copy, CheckCheck, X, Plus } from "lucide-react";
import { useCreateBooking } from "@/hooks/useCreateBooking";
import { useProperty } from "@/hooks/useProperty";
import { bookingInquiryLink } from "@/lib/whatsapp";
import { extractUPIId } from "@/utils/upi";
import { UPIPaymentSection } from "@/components/UPIPaymentSection";
import type { BookingDetails } from "@/components/RoomDetail";

type Payment = "UPI" | "Cash on Arrival";

type Props = {
  selections: BookingDetails[];
  onRemoveRoom: (roomId: string) => void;
  subdomain: string;
};

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

export function BookingForm({ selections, onRemoveRoom, subdomain }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+91 ");
  const [email, setEmail] = useState("");
  const [requests, setRequests] = useState("");
  const [payment, setPayment] = useState<Payment>("UPI");
  const [submitted, setSubmitted] = useState(false);
  const [submittedName, setSubmittedName] = useState("");
  const [submittedPhone, setSubmittedPhone] = useState("");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [groupRef, setGroupRef] = useState<string | null>(null);
  const [ownerNotifyLink, setOwnerNotifyLink] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const waRef = useRef<HTMLAnchorElement>(null);

  const { data: property } = useProperty(subdomain);
  const { mutateAsync: createBooking, isPending } = useCreateBooking();

  const handlePhoneChange = (val: string) => {
    if (!val.startsWith("+91")) {
      setPhone("+91 ");
    } else {
      setPhone(val);
    }
  };

  // Derived totals across all selected rooms
  const totalNights = selections[0]?.nights ?? 0;
  const grandTotal = selections.reduce((sum, s) => sum + s.total, 0);
  const totalGuests = selections.reduce((sum, s) => sum + s.adults + (s.children ?? 0), 0);
  const hasSelection = selections.length > 0;

  const handleCopyRef = () => {
    if (!groupRef) return;
    navigator.clipboard.writeText(groupRef).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!hasSelection) return;

    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 12) {
      setError("Please enter a valid 10-digit Indian mobile number.");
      return;
    }

    const propertyId = property?.id;
    if (!propertyId) {
      setError("Property not loaded. Please refresh and try again.");
      return;
    }

    try {
      // TEMP DEBUG — remove after diagnosing the Misty Ridge issue
      console.log("[booking-debug] selections cart:", selections.map((s) => ({
        roomId: s.room.id,
        roomName: s.room.name,
        roomMaxGuests: s.room.max_guests,
        adults: s.adults,
        children: s.children,
        computedGuestCount: s.adults + (s.children ?? 0),
      })));

      const result = await createBooking({
        propertyId,
        rooms: selections.map((s) => ({
          roomId: s.room.id,
          guestCount: s.adults + (s.children ?? 0),
        })),
        guestName: name,
        guestPhone: phone,
        guestEmail: email || undefined,
        totalGuests,
        checkIn: selections[0].checkIn,
        checkOut: selections[0].checkOut,
        paymentMethod: payment,
      });

      setSubmittedName(name);
      setSubmittedPhone(phone);
      setBookingId(result.bookingId);
      setGroupRef(result.groupRef);

      if (property?.owner_whatsapp) {
        const link = buildOwnerNotifyLink({
          ownerWhatsapp: property.owner_whatsapp,
          guestName: name,
          guestPhone: phone,
          propertyName: property.name,
          rooms: selections.map((s) => ({ name: s.room.name, guests: s.adults + (s.children ?? 0) })),
          checkIn: selections[0].checkIn,
          checkOut: selections[0].checkOut,
          totalGuests,
          grandTotal: result.totalAmount,
          bookingId: result.bookingId,
        });
        setOwnerNotifyLink(link);

        if (waRef.current) {
          waRef.current.href = link;
          waRef.current.click();
        }
      }

      setSubmitted(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message ? err.message : "Booking failed — please try again.";
      setError(msg);
    }
  };

  const whatsappBookingLink =
    property?.owner_whatsapp && hasSelection
      ? bookingInquiryLink({
          ownerWhatsapp: property.owner_whatsapp,
          propertyName: property.name,
          roomName: selections.map((s) => s.room.name).join(", "),
          checkIn: selections[0].checkIn,
          checkOut: selections[0].checkOut,
          guests: totalGuests,
          guestName: submitted ? submittedName : name,
          guestPhone: submitted ? submittedPhone : phone,
        })
      : null;

  const trackingUrl = submittedPhone
    ? `${window.location.origin}/booking-status?phone=${encodeURIComponent(submittedPhone)}`
    : null;

  const upiId = property ? extractUPIId(property.shared_amenities) : null;

  return (
    <section id="booking" className="py-16 md:py-24 bg-background">
      {/* Hidden anchor for WhatsApp without popup blocker */}
      <a ref={waRef} href="#" target="_blank" rel="noreferrer" className="hidden" aria-hidden="true" />

      <div className="mx-auto max-w-3xl px-4 md:px-8">
        <div className="text-center mb-10">
          <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">
            Step 3
          </span>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold">Confirm your booking</h2>
        </div>

        {!hasSelection && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            Select a room above to continue.
          </div>
        )}

        {hasSelection && (
          <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-[var(--shadow-soft)]">
            {/* ── Room cart summary ── */}
            <div className="rounded-xl bg-primary-light/40 p-4 mb-6 space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">
                {selections.length === 1 ? "Your room" : `Your rooms (${selections.length})`}
              </div>

              {selections.map((s) => (
                <div key={s.room.id} className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{s.room.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {s.nights} night{s.nights > 1 ? "s" : ""} · {s.adults} adults
                      {s.children ? ` · ${s.children} children` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      ₹{s.total.toLocaleString("en-IN")}
                    </span>
                    {!submitted && (
                      <button
                        type="button"
                        onClick={() => onRemoveRoom(s.room.id)}
                        className="h-6 w-6 rounded-full hover:bg-red-50 text-muted-foreground hover:text-red-500 flex items-center justify-center transition-colors"
                        aria-label={`Remove ${s.room.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Grand total */}
              {selections.length > 1 && (
                <div className="pt-2 border-t border-primary/20 flex justify-between items-center">
                  <span className="text-sm font-medium">Total ({totalGuests} guests)</span>
                  <span className="font-display text-xl font-semibold text-primary">
                    ₹{grandTotal.toLocaleString("en-IN")}
                  </span>
                </div>
              )}

              {selections.length === 1 && (
                <div className="font-display text-xl font-semibold text-primary pt-1">
                  ₹{grandTotal.toLocaleString("en-IN")}
                </div>
              )}

              {payment === "UPI" && (
                <div className="text-xs text-muted-foreground">
                  Suggested advance (25%): ₹
                  {Math.round(grandTotal * 0.25).toLocaleString("en-IN")}
                </div>
              )}
            </div>

            {/* Add another room CTA — shown pre-submission */}
            {!submitted && (
              <a
                href="#rooms"
                className="flex items-center justify-center gap-2 w-full mb-5 rounded-xl border border-dashed border-primary/40 py-2.5 text-xs font-medium text-primary hover:bg-primary-light/30 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add another room
              </a>
            )}

            {submitted ? (
              /* ── SUCCESS STATE ── */
              <div className="space-y-5">
                <div className="text-center">
                  <div className="mx-auto h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-3">
                    <Check className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl font-semibold">Request sent!</h3>
                  <p className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
                    {property?.owner_name ?? "The host"} will confirm your booking shortly.
                  </p>
                </div>

                {/* Booking reference */}
                {groupRef && (
                  <div className="rounded-xl border border-primary/20 bg-primary-light/30 p-4 text-center space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                      Booking reference
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-mono text-2xl font-semibold text-primary tracking-widest">
                        {groupRef}
                      </span>
                      <button
                        onClick={handleCopyRef}
                        className="text-muted-foreground hover:text-primary transition-colors p-1 rounded"
                        aria-label="Copy booking reference"
                      >
                        {copied ? (
                          <CheckCheck className="h-4 w-4 text-primary" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Quote this number when contacting the host.
                    </p>
                  </div>
                )}

                {/* WhatsApp CTA */}
                {ownerNotifyLink && (
                  <div className="rounded-xl border border-[#25D366]/30 bg-[#25D366]/5 p-4 space-y-2">
                    <p className="text-xs text-muted-foreground text-center">
                      Tap below to notify {property?.owner_name ?? "the host"} on WhatsApp so they confirm faster.
                    </p>
                    <a
                      href={ownerNotifyLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white px-5 py-3 text-sm font-medium hover:opacity-90 transition-opacity w-full justify-center"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Notify {property?.owner_name ?? "host"} on WhatsApp
                    </a>
                  </div>
                )}

                {/* Stay summary */}
                <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-sm">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">
                    Your booking
                  </div>
                  {selections.map((s) => (
                    <div key={s.room.id} className="flex justify-between">
                      <span className="text-muted-foreground">{s.room.name}</span>
                      <span className="font-medium">₹{s.total.toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1 border-t border-border">
                    <span className="text-muted-foreground">Check-in</span>
                    <span className="font-medium">{selections[0].checkIn}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Check-out</span>
                    <span className="font-medium">{selections[0].checkOut}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total guests</span>
                    <span className="font-medium">{totalGuests}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-border">
                    <span className="text-muted-foreground">Grand total</span>
                    <span className="font-semibold text-primary">
                      ₹{grandTotal.toLocaleString("en-IN")}
                    </span>
                  </div>
                  {payment === "Cash on Arrival" && (
                    <div className="mt-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
                      Full payment of ₹{grandTotal.toLocaleString("en-IN")} is due on arrival.
                      No advance needed.
                    </div>
                  )}
                </div>

                {/* UPI Payment — only for UPI, shown for first room as the combined total */}
                {upiId && payment === "UPI" && (
                  <UPIPaymentSection
                    upiId={upiId}
                    payeeName={property?.owner_name ?? property?.name ?? ""}
                    totalAmount={grandTotal}
                    advancePaid={0}
                    bookingNote={`Booking – ${property?.name} – ${selections[0].checkIn}`}
                    ownerWhatsapp={property?.owner_whatsapp ?? ""}
                    guestName={submittedName}
                    propertyName={property?.name ?? ""}
                    roomName={selections.map((s) => s.room.name).join(", ")}
                    checkIn={selections[0].checkIn}
                    bookingId={bookingId ?? undefined}
                  />
                )}

                {trackingUrl && (
                  <a
                    href={trackingUrl}
                    className="flex items-center justify-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Track booking status
                  </a>
                )}

                <p className="text-center text-xs text-muted-foreground">
                  {selections[0].checkIn} → {selections[0].checkOut} · {totalNights} night{totalNights > 1 ? "s" : ""}
                </p>
              </div>
            ) : (
              /* ── BOOKING FORM ── */
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Full name" required>
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputCls}
                      placeholder="Your full name"
                    />
                  </Field>
                  <Field label="Phone" required>
                    <input
                      required
                      type="tel"
                      value={phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      className={inputCls}
                      placeholder="+91 98765 43210"
                    />
                  </Field>
                </div>

                <Field label="Email">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                    placeholder="optional"
                  />
                </Field>

                <Field label="Special requests">
                  <textarea
                    rows={3}
                    value={requests}
                    onChange={(e) => setRequests(e.target.value)}
                    className={inputCls}
                    placeholder="Arrival time, dietary needs, etc."
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Send these to the owner via WhatsApp after booking.
                  </p>
                </Field>

                <Field label="Payment method">
                  <div className="grid grid-cols-2 gap-2">
                    {(["UPI", "Cash on Arrival"] as Payment[]).map((p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setPayment(p)}
                        className={[
                          "rounded-lg border px-3 py-2 text-xs md:text-sm font-medium transition-colors",
                          payment === p
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-accent",
                        ].join(" ")}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {payment === "UPI" &&
                      "Pay 25% advance via UPI to confirm. Full balance due on arrival."}
                    {payment === "Cash on Arrival" &&
                      "No advance needed. Pay the full amount on arrival at the property."}
                  </p>
                </Field>

                {whatsappBookingLink && (
                  <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-2">Prefer to book directly?</p>
                    <a
                      href={whatsappBookingLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-[#25D366] text-[#128C7E] px-4 py-2 text-xs font-medium hover:bg-[#25D366]/10 transition-colors"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Book via WhatsApp instead
                    </a>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                    <p className="text-xs text-destructive font-medium">Booking failed</p>
                    <p className="text-xs text-destructive mt-0.5">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full rounded-full bg-primary py-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {isPending
                    ? "Submitting..."
                    : selections.length > 1
                    ? `Send Group Booking Request (${selections.length} rooms)`
                    : "Send Booking Request"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
        {required && " *"}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// Multi-room aware owner WhatsApp message
function buildOwnerNotifyLink({
  ownerWhatsapp,
  guestName,
  guestPhone,
  propertyName,
  rooms,
  checkIn,
  checkOut,
  totalGuests,
  grandTotal,
  bookingId,
}: {
  ownerWhatsapp: string;
  guestName: string;
  guestPhone: string;
  propertyName: string;
  rooms: { name: string; guests: number }[];
  checkIn: string;
  checkOut: string;
  totalGuests: number;
  grandTotal: number;
  bookingId: string;
}): string {
  const digits = ownerWhatsapp.replace(/\D/g, "");
  const normalized =
    digits.startsWith("91") && digits.length === 12
      ? digits
      : digits.length === 10
      ? `91${digits}`
      : digits;

  const shortId = bookingId.slice(0, 8).toUpperCase();
  const roomLines = rooms
    .map((r) => `  • ${r.name} (${r.guests} guest${r.guests > 1 ? "s" : ""})`)
    .join("\n");

  const text =
    `🏡 New booking request — ${propertyName}\n\n` +
    `Guest: ${guestName}\n` +
    `Phone: ${guestPhone}\n` +
    `Check-in: ${checkIn}\n` +
    `Check-out: ${checkOut}\n` +
    `Total guests: ${totalGuests}\n` +
    `Rooms:\n${roomLines}\n` +
    `Total: ₹${grandTotal.toLocaleString("en-IN")}\n` +
    `Ref: #${shortId}\n\n` +
    `Please confirm this booking.`;

  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}
 
