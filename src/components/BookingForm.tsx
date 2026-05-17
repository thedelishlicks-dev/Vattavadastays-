import { useState } from "react";
import { Check, MessageCircle } from "lucide-react";
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
  const [error, setError] = useState("");

  const { data: property } = useProperty(subdomain);
  const { mutateAsync: createBooking, isPending } = useCreateBooking();

  const handlePhoneChange = (val: string) => {
    // Always keep +91 prefix — restore it if deleted
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
      await createBooking({
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
      setSubmitted(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      setError(msg);
    }
  };

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
            </div>

            {submitted ? (
              <div className="text-center py-6 space-y-4">
                <div className="mx-auto h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-semibold">
                    Request sent!
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
                    {property?.owner_name ?? "The host"} will confirm your booking
                    on WhatsApp shortly.
                  </p>
                </div>
                {whatsappBookingLink && (
                  <a
                    href={whatsappBookingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Message on WhatsApp
                  </a>
                )}
                <p className="text-xs text-muted-foreground">
                  Check-in: {selection.checkIn} · Check-out: {selection.checkOut}
                </p>
              </div>
            ) : (
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
                    {(["UPI", "Bank Transfer", "Cash on Arrival"] as Payment[]).map(
                      (p) => (
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
                      )
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {payment === "UPI" &&
                      "Pay 25% via UPI to confirm. Details shared on WhatsApp."}
                    {payment === "Bank Transfer" &&
                      "Bank details will be shared after request."}
                    {payment === "Cash on Arrival" &&
                      "Pay in cash on arrival at the property."}
                  </p>
                </Field>

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
                      Book via WhatsApp
                    </a>
                  </div>
                )}

                {error && (
                  <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full rounded-full bg-primary py-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {isPending ? "Submitting..." : "Confirm Request"}
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
