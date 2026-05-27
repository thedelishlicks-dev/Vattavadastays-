import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  Loader2, Search, CheckCircle2, Clock, LogIn, Star,
  XCircle, Phone, MapPin, MessageCircle, IndianRupee,
} from "lucide-react";
import { extractUPIId } from "@/utils/upi";
import { UPIPaymentSection } from "@/components/UPIPaymentSection";
import type { BookingCharge } from "@/types/database";

export const Route = createFileRoute("/booking-status")({
  component: BookingStatusPage,
  validateSearch: (search: Record<string, unknown>) => ({
    phone: (search.phone as string) ?? "",
    id:    (search.id    as string) ?? "",
  }),
});

const STATUS_STEPS = [
  { key: "pending",    label: "Request sent",  icon: Clock,         desc: "Waiting for owner confirmation" },
  { key: "confirmed",  label: "Confirmed",      icon: CheckCircle2,  desc: "Your stay is confirmed"         },
  { key: "checked_in", label: "Checked in",     icon: LogIn,         desc: "Enjoy your stay!"               },
  { key: "completed",  label: "Completed",      icon: Star,          desc: "Thank you for staying with us"  },
];
const STATUS_ORDER = ["pending", "confirmed", "checked_in", "completed"];

function getStepIndex(status: string) {
  const i = STATUS_ORDER.indexOf(status);
  return i === -1 ? 0 : i;
}

function BookingStatusPage() {
  const { phone: prefillPhone, id: prefillId } = useSearch({ from: "/booking-status" });

  const [phone, setPhone] = useState(prefillPhone ?? "");
  const [bookingId, setBookingId] = useState(prefillId ?? "");
  const [formError, setFormError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["booking-status-lookup", phone, bookingId],
    queryFn: async () => {
      const digits = phone.replace(/\D/g, "");
      const inputLast10 = digits.slice(-10);

      const { data: booking, error: err } = await supabase
        .from("bookings")
        .select("*, booking_charges(*)")
        .eq("id", bookingId.trim())
        .single();

      if (err || !booking) throw new Error("Booking not found. Check your booking ID.");

      const bookingDigits = booking.guest_phone.replace(/\D/g, "").slice(-10);
      if (inputLast10 !== bookingDigits) {
        throw new Error("Phone number doesn't match this booking.");
      }

      const charges = (booking.booking_charges ?? []) as BookingCharge[];
      const chargesTotal = charges.reduce((s: number, c: BookingCharge) => s + c.qty * c.unit_price, 0);
      const advance = Number(booking.advance_amount ?? 0);
      const balance = Math.max(0, Number(booking.total_amount) + chargesTotal - advance);

      return { booking, charges, chargesTotal, advance, balance };
    },
    enabled: false,
    retry: false,
  });

  // Auto-trigger if query params are pre-filled (coming from confirmation screen)
  useEffect(() => {
    if (prefillPhone && prefillId) {
      setHasSearched(true);
      refetch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLookup = () => {
    setFormError("");
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10) {
      setFormError("Enter a valid 10-digit phone number");
      return;
    }
    if (!bookingId.trim()) {
      setFormError("Enter your booking ID");
      return;
    }
    setHasSearched(true);
    refetch();
  };

  const currentStep = data ? getStepIndex(data.booking.status) : -1;
  const isCancelled = data?.booking.status === "cancelled";

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <a href="/" className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">V</span>
          <span className="font-display font-semibold text-primary">VattavadaStays</span>
        </a>
        <span className="text-muted-foreground text-sm">/ Track Booking</span>
      </header>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Track your booking</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your phone number and booking ID to check your reservation status.
          </p>
        </div>

        {/* Lookup form — always visible so guest can re-search */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Phone number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Booking ID</label>
            <input
              type="text"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="Paste your booking reference here"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Found in your booking confirmation screen — copy the reference ID and paste it here.
            </p>
          </div>
          {formError && <p className="text-xs text-destructive">{formError}</p>}
          <button
            onClick={handleLookup}
            disabled={isLoading}
            className="w-full rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {isLoading ? "Looking up…" : "Track booking"}
          </button>
        </div>

        {/* Error */}
        {hasSearched && error && !isLoading && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex gap-3">
            <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Not found</p>
              <p className="text-xs text-destructive/80 mt-0.5">
                {error instanceof Error ? error.message : "Check your details and try again."}
              </p>
            </div>
          </div>
        )}

        {/* Results */}
        {data && !isLoading && (
          <div className="space-y-4">
            {isCancelled ? (
              <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-5 flex gap-3 items-center">
                <XCircle className="h-8 w-8 text-destructive shrink-0" />
                <div>
                  <div className="font-semibold text-destructive">Booking Cancelled</div>
                  <div className="text-sm text-muted-foreground mt-0.5">Contact the property for assistance.</div>
                </div>
              </div>
            ) : (
              /* Status timeline */
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-4">Booking status</div>
                <div className="space-y-0">
                  {STATUS_STEPS.map((step, idx) => {
                    const done   = idx < currentStep;
                    const active = idx === currentStep;
                    const Icon = step.icon;
                    return (
                      <div key={step.key} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={[
                            "h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors",
                            done   ? "bg-primary border-primary text-primary-foreground" :
                            active ? "bg-primary-light border-primary text-primary" :
                                     "bg-background border-border text-muted-foreground",
                          ].join(" ")}>
                            <Icon className="h-4 w-4" />
                          </div>
                          {idx < STATUS_STEPS.length - 1 && (
                            <div className={`w-0.5 h-6 ${done || active ? "bg-primary/30" : "bg-border"}`} />
                          )}
                        </div>
                        <div className="pb-4">
                          <div className={`text-sm font-medium ${idx > currentStep ? "text-muted-foreground" : "text-foreground"}`}>
                            {step.label}
                          </div>
                          {active && <div className="text-xs text-primary mt-0.5">{step.desc}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Booking details */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Booking details</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <DetailRow label="Reference"  value={data.booking.id.slice(0, 8).toUpperCase() + "…"} mono />
                <DetailRow label="Check-in"   value={data.booking.check_in} />
                <DetailRow label="Check-out"  value={data.booking.check_out} />
                <DetailRow label="Nights"     value={`${data.booking.nights}`} />
                <DetailRow label="Guests"     value={`${data.booking.guest_count}`} />
              </div>
            </div>

            {/* Payment summary */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-2">
                <IndianRupee className="h-3.5 w-3.5" /> Payment summary
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Room total</span>
                  <span>₹{Number(data.booking.total_amount).toLocaleString("en-IN")}</span>
                </div>
                {data.chargesTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Extra charges</span>
                    <span>₹{data.chargesTotal.toLocaleString("en-IN")}</span>
                  </div>
                )}
                {data.advance > 0 && (
                  <div className="flex justify-between text-primary">
                    <span>Advance paid</span>
                    <span>-₹{data.advance.toLocaleString("en-IN")}</span>
                  </div>
                )}
                <div className="border-t border-border pt-2 flex justify-between font-semibold">
                  <span>Balance due</span>
                  <span className={data.balance === 0 ? "text-primary" : "text-amber-700"}>
                    {data.balance === 0 ? "Fully paid ✓" : `₹${data.balance.toLocaleString("en-IN")}`}
                  </span>
                </div>
              </div>

              {data.charges.length > 0 && (
                <div className="border-t border-border pt-2 space-y-1">
                  <div className="text-xs text-muted-foreground mb-1">Extra charges breakdown</div>
                  {data.charges.map((c) => (
                    <div key={c.id} className="flex justify-between text-xs text-muted-foreground">
                      <span>{c.description}{c.qty > 1 ? ` ×${c.qty}` : ""}</span>
                      <span>₹{(c.qty * c.unit_price).toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contact property */}
            <ContactProperty
              propertyId={data.booking.property_id}
              booking={data.booking}
              totalAmount={data.booking.total_amount + data.chargesTotal}
              advancePaid={data.advance}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-medium mt-0.5 ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}

function ContactProperty({
  propertyId,
  booking,
  totalAmount,
  advancePaid
}: {
  propertyId: string;
  booking: any;
  totalAmount: number;
  advancePaid: number;
}) {
  const { data: property } = useQuery({
    queryKey: ["property-contact", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("name, owner_name, owner_phone, owner_whatsapp, location_lat, location_lng, shared_amenities")
        .eq("id", propertyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!propertyId,
  });

  if (!property) return null;

  const upiId = extractUPIId(property.shared_amenities);

  const phone = property.owner_phone ?? "";
  const whatsapp = property.owner_whatsapp ?? phone;
  const waLink = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}` : null;
  const mapsLink = property.location_lat && property.location_lng
    ? `https://maps.google.com/?q=${property.location_lat},${property.location_lng}`
    : null;

  return (
    <div className="space-y-4">
      {upiId && booking.status !== 'cancelled' && (
        <UPIPaymentSection
          upiId={upiId}
          payeeName={property.owner_name ?? property.name}
          totalAmount={totalAmount}
          advancePaid={advancePaid}
          bookingNote={`Booking – ${property.name} – ${booking.check_in}`}
          ownerWhatsapp={property.owner_whatsapp ?? ""}
          guestName={booking.guest_name}
          propertyName={property.name}
          roomName={booking.room_name ?? "Room"}
          checkIn={booking.check_in}
          bookingId={booking.id}
        />
      )}

      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Contact property</div>
        <div className="text-sm">
          <div className="font-medium">{property.name}</div>
          {property.owner_name && <div className="text-muted-foreground text-xs mt-0.5">Host: {property.owner_name}</div>}
        </div>
        <div className="flex flex-col gap-2">
          {phone && (
            <a href={`tel:+${phone.replace(/\D/g, "")}`} className="flex items-center gap-3 rounded-full border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
              <Phone className="h-4 w-4" /> Call {property.owner_name ?? "host"}
            </a>
          )}
          {waLink && (
            <a href={waLink} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-full bg-[#25D366] text-white px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          )}
          {mapsLink && (
            <a href={mapsLink} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-full border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
              <MapPin className="h-4 w-4" /> Get directions
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
