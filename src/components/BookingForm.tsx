import { useState } from "react";
import { Check, MessageCircle, ExternalLink, Copy } from "lucide-react";
import { useCreateBooking } from "@/hooks/useCreateBooking";
import { useProperty } from "@/hooks/useProperty";
import { bookingInquiryLink } from "@/lib/whatsapp";
import type { BookingDetails } from "@/components/RoomDetail";

type Payment = "UPI" | "Bank Transfer" | "Cash on Arrival";

type Props = {
  selection: BookingDetails | null;
  subdomain: string;
};

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

export function BookingForm({ selection, subdomain }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+91 ");
  const [email, setEmail] = useState("");
  const [requests, setRequests] = useState("");
  const [payment, setPayment] = useState<Payment>("UPI");
  const [submitted, setSubmitted] = useState(false);
  const [submittedName, setSubmittedName] = useState("");
  const [submittedPhone, setSubmittedPhone] = useState("");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [error, setError] = useState("");

  const { data: property } = useProperty(subdomain);
  const { mutateAsync: createBooking, isPending } = useCreateBooking();

  const handlePhoneChange = (val: string) => {
    if (!val.startsWith("+91")) {
      setPhone("+91 ");
    } else {
      setPhone(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selection) return;
    setError("");

    const propertyId = property?.id;
    if (!propertyId) {
      setError("Property not loaded. Please refresh and try again.");
      return;
    }

    try {
      const id = await createBooking({
        property_id: propertyId,
        room_id: selection.room.id,
        guest_name: name,
        guest_phone: phone,
        guest_email: email || undefined,
        guest_count: selection.adults + (selection.children ?? 0),
        check_in: selection.checkIn,
        check_out: selection.checkOut,
        room_price: selection.room.base_price,
        extra_guest_charge: selection.extraGuestCharge ?? 0,
        total_amount: selection.total,
        payment_method: payment,
      });
      setSubmittedName(name);
      setSubmittedPhone(phone);
      setBookingId(id ?? null);
      setSubmitted(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Insert failed — check Supabase logs";
      setError(msg);
    }
  };

  // WhatsApp link for guest to message owner directly
  const whatsappBookingLink =
    property?.owner_whatsapp && selection
      ? bookingInquiryLink({
          ownerWhatsapp: property.owner_whatsapp,
          propertyName: property.name,
          roomName: selection.room.name,
          checkIn: selection.checkIn,
          checkOut: selection.checkOut,
          guests: selection.adults + (selection.children ?? 0),
          guestName: submitted ? submittedName : name,
          guestPhone: submitted ? submittedPhone : phone,
        })
      : null;

  // WhatsApp notification link — guest taps to notify owner of new request
  const ownerNotifyLink =
    property?.owner_whatsapp && selection && bookingId
      ? buildOwnerNotifyLink({
          ownerWhatsapp: property.owner_whatsapp,
          guestName: submittedName,
          guestPhone: submittedPhone,
          propertyName: property.name,
          roomName: selection.room.name,
          checkIn: selection.checkIn,
          checkOut: selection.checkOut,
          guests: selection.adults + (selection.children ?? 0),
          total: selection.total,
          bookingId,
        })
      : null;

  const trackingUrl = bookingId
    ? `${window.location.origin}/booking-status?phone=${encodeURIComponent(submittedPhone)}&id=${bookingId}`
    : null;

  const handleCopyRef = () => {
    if (bookingId) {
      navigator.clipboard.writeText(bookingId);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    }
  };

  return (
    <section id="booking" className="py-16 md:py-24 bg-background">
      <div className="mx-auto max-w-3xl px-4 md:px-8">
        <div className="text-center mb-10">
          <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">
            Step 3
          </span>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold">
            Confirm your booking
          </h2>
        </div>

        {!selection && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            Select a room above to continue.
          </div>
        )}

        {selection && (
          <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-[var(--shadow-soft)]">
            {/* Selection summary */}
            <div className="rounded-xl bg-primary-light/40 p-4 mb-6 text-sm">
              <div className="font-medium">{selection.room.name}</div>
              <div className="text-muted-foreground text-xs mt-0.5">
                {selection.nights} night{selection.nights > 1 ? "s" : ""} ·{" "}
                {selection.adults} adults
                {selection.children ? ` · ${selection.children} children` : ""}
              </div>
              <div className="mt-2 font-display text-xl font-semibold text-primary">
                ₹{selection.total.toLocaleString("en-IN")}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Suggested advance (25%): ₹{Math.round(selection.total * 0.25).toLocaleString("en-IN")}
              </div>
            </div>

            {submitted ? (
              /* ── SUCCESS STATE ── */
              <div className="space-y-5">
                {/* Confirmation header */}
                <div className="text-center">
                  <div className="mx-auto h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-3">
                    <Check className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl font-semibold">Request sent!</h3>
                  <p className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
                    {property?.owner_name ?? "The host"} will confirm your booking shortly.
                  </p>
                </div>

                {/* Booking reference card */}
                <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Your booking reference
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-background border border-border rounded-lg px-3 py-2 font-mono break-all">
                      {bookingId}
                    </code>
                    <button
                      onClick={handleCopyRef}
                      className="h-8 w-8 rounded-lg border border-border hover:bg-muted flex items-center justify-center shrink-0"
                      title="Copy booking ID"
                    >
                      {copiedRef
                        ? <Check className="h-3.5 w-3.5 text-primary" />
                        : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Save this ID — you'll need it to track your booking status.
                  </p>
                </div>

                {/* Notify owner — primary CTA */}
                {ownerNotifyLink && (
                  <div className="rounded-xl border border-[#25D366]/30 bg-[#25D366]/5 p-4 space-y-2">
                    <div className="text-sm font-medium">Notify the owner</div>
                    <p className="text-xs text-muted-foreground">
                      Tap below to send your booking details to {property?.owner_name ?? "the host"} on WhatsApp so they can confirm faster.
                    </p>
                    <a
                      href={ownerNotifyLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity w-full justify-center"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Notify {property?.owner_name ?? "host"} on WhatsApp
                    </a>
                  </div>
                )}

                {/* Track booking */}
                {trackingUrl && (
                  <a
                    href={trackingUrl}
                    className="flex items-center justify-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Track booking status
                  </a>
                )}

                {/* Stay details reminder */}
                <p className="text-center text-xs text-muted-foreground">
                  {selection.checkIn} → {selection.checkOut} · {selection.room.name}
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
                </Field>

                <Field label="Payment method">
                  <div className="grid grid-cols-3 gap-2">
                    {(["UPI", "Bank Transfer", "Cash on Arrival"] as Payment[]).map((p) => (
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
                      "Pay 25% advance via UPI to confirm. Details shared on WhatsApp."}
                    {payment === "Bank Transfer" &&
                      "Bank details shared after your request is confirmed."}
                    {payment === "Cash on Arrival" &&
                      "Pay in full on arrival at the property."}
                  </p>
                </Field>

                {/* WhatsApp direct option */}
                {whatsappBookingLink && (
                  <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-2">
                      Prefer to book directly?
                    </p>
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
                  {isPending ? "Submitting..." : "Send Booking Request"}
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

// Build owner notification WhatsApp message
function buildOwnerNotifyLink({
  ownerWhatsapp,
  guestName,
  guestPhone,
  propertyName,
  roomName,
  checkIn,
  checkOut,
  guests,
  total,
  bookingId,
}: {
  ownerWhatsapp: string;
  guestName: string;
  guestPhone: string;
  propertyName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  total: number;
  bookingId: string;
}): string {
  const digits = ownerWhatsapp.replace(/\D/g, "");
  const normalized = digits.startsWith("91") && digits.length === 12
    ? digits
    : digits.length === 10 ? `91${digits}` : digits;

  const shortId = bookingId.slice(0, 8).toUpperCase();
  const text =
    `🏡 New booking request — ${propertyName}\n\n` +
    `Guest: ${guestName}\n` +
    `Phone: ${guestPhone}\n` +
    `Room: ${roomName}\n` +
    `Check-in: ${checkIn}\n` +
    `Check-out: ${checkOut}\n` +
    `Guests: ${guests}\n` +
    `Total: ₹${total.toLocaleString("en-IN")}\n` +
    `Ref: #${shortId}\n\n` +
    `Please confirm this booking.`;

  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}
