import { formatIndianPhoneInput, isValidIndianMobile, waDigits } from "@/lib/phone";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock, ExternalLink, MessageCircle, Copy, CheckCheck, X, Plus } from "lucide-react";
import { useCreateBooking } from "@/hooks/useCreateBooking";
import { useGuestBookingStatus } from "@/hooks/useGuestBookingStatus";
import { guestStatusView, type GuestStatusTone } from "@/lib/guestBookingStatus";
import { useProperty } from "@/hooks/useProperty";
import { bookingInquiryLink, guestTrackingUrl } from "@/lib/whatsapp";
import { extractUPIId } from "@/utils/upi";
import { GuestPolicies } from "@/components/GuestPolicies";
import { UPIPaymentSection } from "@/components/UPIPaymentSection";
import type { BookingDetails } from "@/components/RoomDetail";
import { guestPaymentOptions, paymentNote, type GuestPayment } from "@/lib/guestPayment";
import {
  browserStore, clearConfirmation, loadConfirmation, saveConfirmation, selectionKey,
  type Confirmation,
} from "@/lib/bookingConfirmation";

type Payment = GuestPayment;
type Property = NonNullable<ReturnType<typeof useProperty>["data"]>;

type Props = {
  selections: BookingDetails[];
  onRemoveRoom: (roomId: string) => void;
  subdomain: string;
};

const inputCls =
  "focus-glow w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm shadow-[var(--shadow-neu-inset-sm)] transition-all duration-[var(--duration-base)] ease-[var(--ease-smooth)] focus:outline-none";

export function BookingForm({ selections, onRemoveRoom, subdomain }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+91 ");
  const [email, setEmail] = useState("");
  const [requests, setRequests] = useState("");
  const [payment, setPayment] = useState<Payment>("UPI");
  const [error, setError] = useState("");

  // The "Request sent!" screen is drawn from this saved snapshot, not from the current
  // selection, and survives a reload (see lib/bookingConfirmation.ts).
  const store = useMemo(() => browserStore(), []);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const waRef = useRef<HTMLAnchorElement>(null);

  const { data: property } = useProperty(subdomain);
  const { mutateAsync: createBooking, isPending } = useCreateBooking();

  useEffect(() => {
    if (property?.id) setConfirmation(loadConfirmation(store, property.id));
  }, [property?.id, store]);

  const upiId = property ? extractUPIId(property.shared_amenities) : null;
  const paymentOptions = guestPaymentOptions(property?.shared_amenities, upiId);
  const paymentOptionsKey = paymentOptions.join("|");
  useEffect(() => {
    if (!paymentOptions.includes(payment)) setPayment(paymentOptions[0]);
  }, [paymentOptionsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typing or pasting in any usual form ("98765 43210", "+91…", "091…", "0091…") keeps
  // the number; it used to wipe anything pasted without "+91".
  const handlePhoneChange = (val: string) => setPhone(formatIndianPhoneInput(val));

  // Derived totals across all selected rooms
  const totalNights = selections[0]?.nights ?? 0;
  const grandTotal = selections.reduce((sum, s) => sum + s.total, 0);
  const totalGuests = selections.reduce((sum, s) => sum + s.adults + (s.children ?? 0), 0);
  const hasSelection = selections.length > 0;

  const currentKey = selectionKey(selections.map((s) => ({ roomId: s.room.id, checkIn: s.checkIn, checkOut: s.checkOut })));
  // The form is replaced by the confirmation only for the selection that was just booked.
  const justBooked = !!confirmation && hasSelection && confirmation.selectionKey === currentKey;

  const dismissConfirmation = () => {
    clearConfirmation(store);
    setConfirmation(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!hasSelection) return;

    if (!isValidIndianMobile(phone)) {
      setError("Please enter a valid 10-digit Indian mobile number.");
      return;
    }

    const propertyId = property?.id;
    if (!propertyId) {
      setError("Property not loaded. Please refresh and try again.");
      return;
    }

    try {
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
        propertyCheckInTime: property?.check_in_time ?? null,
        propertyCheckOutTime: property?.check_out_time ?? null,
        propertyPendingHoldHours: property?.pending_hold_hours ?? null,
      });

      const cleanRequests = requests.trim().slice(0, 500);
      const link = property?.owner_whatsapp
        ? buildOwnerNotifyLink({
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
            requests: cleanRequests,
          })
        : null;

      const snapshot: Confirmation = {
        v: 1,
        savedAt: Date.now(),
        propertyId,
        name,
        phone,
        bookingId: result.bookingId,
        groupRef: result.groupRef,
        trackingToken: result.trackingToken,
        ownerNotifyLink: link,
        rooms: result.rooms.map((r) => ({ name: r.roomName, total: r.totalAmount })),
        checkIn: selections[0].checkIn,
        checkOut: selections[0].checkOut,
        nights: result.nights,
        totalGuests,
        grandTotal: result.totalAmount,
        payment,
        requests: cleanRequests,
        selectionKey: currentKey,
      };
      saveConfirmation(store, snapshot);   // survives a reload (e.g. after the GPay round trip)
      setConfirmation(snapshot);
      setRequests("");

      if (link && waRef.current) {
        waRef.current.href = link;
        waRef.current.click();
      }
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
          guestName: name,
          guestPhone: phone,
        })
      : null;

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

        {/* Full "Request sent" card: for the booking just made, or after a reload
            when no rooms are selected. A different selection gets the compact
            strip instead, so an old request never looks like a new one. */}
        {confirmation && (!hasSelection || justBooked) && (
          <ConfirmationCard
            confirmation={confirmation}
            property={property}
            upiId={upiId}
            onDismiss={dismissConfirmation}
            showDismissLabel={justBooked ? "Book another stay" : "Dismiss"}
          />
        )}

        {confirmation && hasSelection && !justBooked && (
          <RecentBookingStrip confirmation={confirmation} onDismiss={dismissConfirmation} />
        )}

        {!hasSelection && !confirmation && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            Select a room above to continue.
          </div>
        )}

        {hasSelection && !justBooked && (
          <div className={["bg-card border border-border rounded-2xl p-6 md:p-8 shadow-[var(--shadow-soft)]", confirmation ? "mt-8" : ""].join(" ")}>
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
                                          <button
                        type="button"
                        onClick={() => onRemoveRoom(s.room.id)}
                        className="h-6 w-6 rounded-full hover:bg-red-50 text-muted-foreground hover:text-red-500 flex items-center justify-center transition-colors"
                        aria-label={`Remove ${s.room.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
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
                          <a
                href="#rooms"
                className="flex items-center justify-center gap-2 w-full mb-5 rounded-xl border border-dashed border-primary/40 py-2.5 text-xs font-medium text-primary hover:bg-primary-light/30 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add another room
              </a>

            {/* ── BOOKING FORM ── */}
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
                    Included in your booking message to the host on WhatsApp.
                  </p>
                </Field>

                <Field label="Payment method">
                  <div className={paymentOptions.length > 1 ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"}>
                    {paymentOptions.map((p) => (
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
                    {paymentNote(payment)}
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

                <GuestPolicies
                  sharedAmenities={property?.shared_amenities}
                  checkInTime={property?.check_in_time}
                  checkOutTime={property?.check_out_time}
                />

                {error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                    <p className="text-xs text-destructive font-medium">Booking failed</p>
                    <p className="text-xs text-destructive mt-0.5">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full rounded-full bg-primary py-4 text-sm font-medium text-primary-foreground shadow-[var(--shadow-neu-raised)] transition-all duration-[var(--duration-fast)] ease-[var(--ease-snappy)] hover:opacity-90 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] active:shadow-[var(--shadow-neu-pressed)] disabled:opacity-50 disabled:active:scale-100"
                >
                  {isPending
                    ? "Submitting..."
                    : selections.length > 1
                    ? `Send Group Booking Request (${selections.length} rooms)`
                    : "Send Booking Request"}
                </button>
              </form>
          </div>
        )}
      </div>
    </section>
  );
}

// How each status looks on the card: the round icon, and the status pill under the heading.
const TONE_STYLES: Record<GuestStatusTone, { icon: string; pill: string }> = {
  pending: { icon: "bg-amber-500 text-white", pill: "bg-amber-50 border-amber-200 text-amber-800" },
  confirmed: { icon: "bg-primary text-primary-foreground", pill: "bg-green-50 border-green-200 text-green-800" },
  cancelled: { icon: "bg-red-600 text-white", pill: "bg-red-50 border-red-200 text-red-700" },
  done: { icon: "bg-primary text-primary-foreground", pill: "bg-muted border-border text-muted-foreground" },
};

/**
 * "Request sent!" — the stay details are drawn ONLY from the saved snapshot (never from the
 * current room selection), so changing dates or reloading the page cannot alter or lose them.
 * The STATUS line is live: it reads the booking's current status through its tracking token,
 * so it says "Awaiting owner confirmation" until the owner confirms, then "Confirmed".
 */
/** Compact reminder of the guest's most recent booking, shown above a new selection. */
function RecentBookingStrip({ confirmation: c, onDismiss }: {
  confirmation: Confirmation;
  onDismiss: () => void;
}) {
  const ref = c.groupRef ?? `#${c.bookingId.slice(0, 8).toUpperCase()}`;
  const trackingUrl = guestTrackingUrl(window.location.origin, c.trackingToken, c.propertyId);
  const { data: liveStatus } = useGuestBookingStatus(c.trackingToken);
  const view = guestStatusView(liveStatus, "The host", c.payment);
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Your recent booking</div>
        <div className="font-medium">
          <span className="font-mono">{ref}</span> · {c.checkIn} → {c.checkOut}
        </div>
        <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE_STYLES[view.tone].pill}`}>{view.badge}</span>
      </div>
      <div className="flex items-center gap-3">
        <a href={trackingUrl} className="inline-flex items-center gap-1.5 text-primary font-medium hover:underline">
          <ExternalLink className="h-3.5 w-3.5" /> Track
        </a>
        <button type="button" onClick={onDismiss} className="text-xs text-muted-foreground underline hover:text-foreground">
          Dismiss
        </button>
      </div>
    </div>
  );
}

function ConfirmationCard({
  confirmation: c,
  property,
  upiId,
  onDismiss,
  showDismissLabel,
}: {
  confirmation: Confirmation;
  property: Property | null | undefined;
  upiId: string | null;
  onDismiss: () => void;
  showDismissLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const ownerName = property?.owner_name ?? "The host";
  const trackingUrl = guestTrackingUrl(window.location.origin, c.trackingToken, property?.id ?? c.propertyId);
  const ref = c.groupRef;
  // Live status of the booking (see useGuestBookingStatus). Until it loads, or if it can't be read,
  // the card reads "awaiting owner confirmation".
  const { data: liveStatus } = useGuestBookingStatus(c.trackingToken);
  const view = guestStatusView(liveStatus, ownerName, c.payment);
  const isPending = view.tone === "pending";
  const toneStyle = TONE_STYLES[view.tone];

  const handleCopyRef = () => {
    if (!ref) return;
    navigator.clipboard.writeText(ref).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard blocked: the reference is on screen anyway */ });
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-[var(--shadow-soft)] space-y-5">
      <div className="text-center">
        <div className={`mx-auto h-14 w-14 rounded-full flex items-center justify-center mb-3 ${toneStyle.icon}`}>
          {view.tone === "pending" ? <Clock className="h-6 w-6" /> : view.tone === "cancelled" ? <X className="h-6 w-6" /> : <Check className="h-6 w-6" />}
        </div>
        <h3 className="font-display text-xl font-semibold">{view.heading}</h3>
        <span role="status" className={`mt-2 inline-block rounded-full border px-3 py-1 text-xs font-medium ${toneStyle.pill}`}>Status: {view.badge}</span>
        <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">{view.message}</p>
      </div>

      {/* Booking reference */}
      {ref && (
        <div className="rounded-xl border border-primary/20 bg-primary-light/30 p-4 text-center space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            Booking reference
          </p>
          <div className="flex items-center justify-center gap-2">
            <span className="font-mono text-2xl font-semibold text-primary tracking-widest">{ref}</span>
            <button
              type="button"
              onClick={handleCopyRef}
              className="text-muted-foreground hover:text-primary transition-colors p-1 rounded"
              aria-label="Copy booking reference"
            >
              {copied ? <CheckCheck className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Quote this number when contacting the host.</p>
        </div>
      )}

      {/* WhatsApp CTA */}
      {c.ownerNotifyLink && isPending && (
        <div className="rounded-xl border border-[#25D366]/30 bg-[#25D366]/5 p-4 space-y-2">
          <p className="text-xs text-muted-foreground text-center">
            Your request is saved, but the host is only told once you send it. Tap below and press Send in WhatsApp so {property?.owner_name ?? "the host"} can confirm faster.
          </p>
          <a
            href={c.ownerNotifyLink}
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
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">Your booking</div>
        {c.rooms.map((r, i) => (
          <div key={`${r.name}-${i}`} className="flex justify-between">
            <span className="text-muted-foreground">{r.name}</span>
            <span className="font-medium">₹{r.total.toLocaleString("en-IN")}</span>
          </div>
        ))}
        <div className="flex justify-between pt-1 border-t border-border">
          <span className="text-muted-foreground">Check-in</span>
          <span className="font-medium">{c.checkIn}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Check-out</span>
          <span className="font-medium">{c.checkOut}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total guests</span>
          <span className="font-medium">{c.totalGuests}</span>
        </div>
        <div className="flex justify-between pt-1 border-t border-border">
          <span className="text-muted-foreground">Grand total</span>
          <span className="font-semibold text-primary">₹{c.grandTotal.toLocaleString("en-IN")}</span>
        </div>
        {c.requests && (
          <div className="pt-1 border-t border-border">
            <span className="text-muted-foreground">Your requests</span>
            <p className="mt-0.5 font-medium whitespace-pre-wrap break-words">{c.requests}</p>
          </div>
        )}
        {c.payment === "Cash on Arrival" && (
          <div className="mt-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
            Full payment of ₹{c.grandTotal.toLocaleString("en-IN")} is due on arrival. No advance needed.
          </div>
        )}
      </div>

      {/* UPI payment — only when the host has a UPI ID; otherwise tell the guest what happens next */}
      {c.payment === "UPI" && upiId && isPending && (
        <UPIPaymentSection
          upiId={upiId}
          payeeName={property?.owner_name ?? property?.name ?? ""}
          totalAmount={c.grandTotal}
          advancePaid={0}
          bookingNote={`Booking – ${property?.name ?? ""} – ${c.checkIn}`}
          ownerWhatsapp={property?.owner_whatsapp ?? ""}
          guestName={c.name}
          propertyName={property?.name ?? ""}
          roomName={c.rooms.map((r) => r.name).join(", ")}
          checkIn={c.checkIn}
          bookingId={c.bookingId}
        />
      )}
      {c.payment === "UPI" && !upiId && isPending && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
          {ownerName} will share payment details with you on WhatsApp or by phone.
        </div>
      )}

      <GuestPolicies
        sharedAmenities={property?.shared_amenities}
        checkInTime={property?.check_in_time}
        checkOutTime={property?.check_out_time}
        defaultOpen
      />

      <a
        href={trackingUrl}
        className="flex items-center justify-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
      >
        <ExternalLink className="h-4 w-4" />
        Track booking status
      </a>

      <p className="text-center text-xs text-muted-foreground">
        {c.checkIn} → {c.checkOut} · {c.nights} night{c.nights > 1 ? "s" : ""}
      </p>

      <div className="border-t border-border pt-4 flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Plus className="h-4 w-4" />
          {showDismissLabel}
        </button>
        <p className="text-[11px] text-muted-foreground">This confirmation is kept on this phone for 24 hours.</p>
      </div>
    </div>
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
  requests,
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
  requests?: string;
}): string {
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
    (requests ? `Special requests: ${requests}\n` : "") +
    `Ref: #${shortId}\n\n` +
    `Please confirm this booking.`;

  // Shared number rules (lib/phone.ts): handles 10 digits, +91…, 91… and a leading 0.
  return `https://wa.me/${waDigits(ownerWhatsapp)}?text=${encodeURIComponent(text)}`;
}
