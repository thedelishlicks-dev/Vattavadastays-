import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  Loader2, Search, CheckCircle2, Clock, LogIn, Star,
  XCircle, Phone, MapPin, MessageCircle, IndianRupee, Receipt,
} from "lucide-react";
import { extractUPIId } from "@/utils/upi";
import { UPIPaymentSection } from "@/components/UPIPaymentSection";
import { BookingInvoice } from "@/components/BookingInvoice";
import type { BookingCharge } from "@/types/database";

export const Route = createFileRoute("/booking-status")({
  component: BookingStatusPage,
  validateSearch: (search: Record<string, unknown>) => ({
    phone: (search.phone as string) ?? "",
  }),
});

const STATUS_STEPS = [
  { key: "pending",    label: "Request sent",  icon: Clock,        desc: "Waiting for owner confirmation" },
  { key: "confirmed",  label: "Confirmed",      icon: CheckCircle2, desc: "Your stay is confirmed"         },
  { key: "checked_in", label: "Checked in",     icon: LogIn,        desc: "Enjoy your stay!"               },
  { key: "completed",  label: "Completed",      icon: Star,         desc: "Thank you for staying with us"  },
];
const STATUS_ORDER = ["pending", "confirmed", "checked_in", "completed"];

function getStepIndex(status: string) {
  const i = STATUS_ORDER.indexOf(status);
  return i === -1 ? 0 : i;
}

function BookingStatusPage() {
  const { phone: prefillPhone } = useSearch({ from: "/booking-status" });

  const [phone, setPhone] = useState(prefillPhone ?? "");
  const [formError, setFormError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedBookingIdx, setSelectedBookingIdx] = useState(0);
  const [showInvoice, setShowInvoice] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["booking-status-lookup", phone],
    queryFn: async () => {
      const digits = phone.replace(/\D/g, "");
      const last10 = digits.slice(-10);
      if (last10.length < 10) throw new Error("Enter a valid 10-digit phone number.");

      const { data: bookings, error: err } = await supabase
        .from("bookings")
        .select("*, booking_charges(*)")
        .or(`guest_phone.eq.${last10},guest_phone.eq.91${last10},guest_phone.eq.+91${last10}`)
        .order("created_at", { ascending: false });

      if (err) throw new Error("Could not fetch bookings. Please try again.");
      if (!bookings || bookings.length === 0)
        throw new Error("No bookings found for this phone number.");

      return bookings.map((booking) => {
        const charges = (booking.booking_charges ?? []) as BookingCharge[];
        const chargesTotal = charges.reduce((s: number, c: BookingCharge) => s + c.qty * c.unit_price, 0);
        const advance = Number(booking.advance_amount ?? 0);
        const balance = Math.max(0, Number(booking.total_amount) + chargesTotal - advance);
        return { booking, charges, chargesTotal, advance, balance };
      });
    },
    enabled: false,
    retry: false,
  });

  useEffect(() => {
    if (prefillPhone) {
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
    setSelectedBookingIdx(0);
    setShowInvoice(false);
    setHasSearched(true);
    refetch();
  };

  const selected = data?.[selectedBookingIdx];
  const isCancelled = selected?.booking.status === "cancelled";
  const currentStep = selected ? getStepIndex(selected.booking.status) : -1;

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
            Enter your phone number to check your booking status.
          </p>
        </div>

        {/* Lookup form */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Phone number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="+91 98765 43210"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use the same number you used when booking.
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
                {error instanceof Error ? error.message : "Check your number and try again."}
              </p>
            </div>
          </div>
        )}

        {/* Multiple bookings picker */}
        {data && data.length > 1 && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Your bookings
            </div>
            <div className="space-y-2">
              {data.map((d, idx) => (
                <button
                  key={d.booking.id}
                  onClick={() => { setSelectedBookingIdx(idx); setShowInvoice(false); }}
                  className={[
                    "w-full text-left rounded-xl border px-4 py-3 text-sm transition-colors",
                    selectedBookingIdx === idx
                      ? "border-primary bg-primary-light/30"
                      : "border-border hover:bg-muted",
                  ].join(" ")}
                >
                  <div className="font-medium">{d.booking.check_in} → {d.booking.check_out}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    ₹{Number(d.booking.total_amount).toLocaleString("en-IN")} · {d.booking.status}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {selected && !isLoading && (
          <div className="space-y-4">

            {/* Status */}
            {isCancelled ? (
              <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-5 flex gap-3 items-center">
                <XCircle className="h-8 w-8 text-destructive shrink-0" />
                <div>
                  <div className="font-semibold text-destructive">Booking Cancelled</div>
                  <div className="text-sm text-muted-foreground mt-0.5">Contact the property for assistance.</div>
                </div>
              </div>
            ) : (
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
                <DetailRow label="Check-in"  value={selected.booking.check_in} />
                <DetailRow label="Check-out" value={selected.booking.check_out} />
                <DetailRow label="Nights"    value={`${selected.booking.nights}`} />
                <DetailRow label="Guests"    value={`${selected.booking.guest_count}`} />
              </div>
            </div>

            {/* Payment summary — hide balance for cancelled */}
            {!isCancelled && (
              <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-2">
                  <IndianRupee className="h-3.5 w-3.5" /> Payment summary
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Room total</span>
                    <span>₹{Number(selected.booking.total_amount).toLocaleString("en-IN")}</span>
                  </div>
                  {selected.chargesTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Extra charges</span>
                      <span>₹{selected.chargesTotal.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {selected.advance > 0 && (
                    <div className="flex justify-between text-primary">
                      <span>Advance paid</span>
                      <span>-₹{selected.advance.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-2 flex justify-between font-semibold">
                    <span>Balance due</span>
                    <span className={selected.balance === 0 ? "text-primary" : "text-amber-700"}>
                      {selected.balance === 0 ? "Fully paid ✓" : `₹${selected.balance.toLocaleString("en-IN")}`}
                    </span>
                  </div>
                </div>
                {selected.charges.length > 0 && (
                  <div className="border-t border-border pt-2 space-y-1">
                    <div className="text-xs text-muted-foreground mb-1">Extra charges breakdown</div>
                    {selected.charges.map((c) => (
                      <div key={c.id} className="flex justify-between text-xs text-muted-foreground">
                        <span>{c.description}{c.qty > 1 ? ` ×${c.qty}` : ""}</span>
                        <span>₹{(c.qty * c.unit_price).toLocaleString("en-IN")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Invoice toggle */}
            {!isCancelled && (
              <button
                onClick={() => setShowInvoice((v) => !v)}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm font-medium hover:bg-muted transition-colors"
              >
                <Receipt className="h-4 w-4 text-primary" />
                {showInvoice ? "Hide invoice" : "View invoice"}
              </button>
            )}

            {/* Invoice — guest view (no Send to guest button) */}
            {showInvoice && !isCancelled && (
              <ContactPropertyWithInvoice
                propertyId={selected.booking.property_id}
                booking={selected.booking}
                charges={selected.charges}
                chargesTotal={selected.chargesTotal}
                advance={selected.advance}
                balance={selected.balance}
                totalAmount={selected.booking.total_amount + selected.chargesTotal}
                advancePaid={selected.advance}
              />
            )}

            {/* Contact property (always shown) */}
            <ContactProperty
              propertyId={selected.booking.property_id}
              booking={selected.booking}
              totalAmount={selected.booking.total_amount + selected.chargesTotal}
              advancePaid={selected.advance}
              showUPI={!isCancelled}
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

// Fetches property for invoice rendering
function ContactPropertyWithInvoice({
  propertyId, booking, charges, chargesTotal, advance, balance, totalAmount, advancePaid,
}: {
  propertyId: string;
  booking: any;
  charges: BookingCharge[];
  chargesTotal: number;
  advance: number;
  balance: number;
  totalAmount: number;
  advancePaid: number;
}) {
  const { data: property } = useQuery({
    queryKey: ["property-contact", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("name, area, owner_name, owner_phone, owner_whatsapp, location_lat, location_lng, shared_amenities")
        .eq("id", propertyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!propertyId,
  });

  if (!property) return null;

  // Room name — we don't have it easily here so use a fallback
  const roomName = booking.room_name ?? "Room";

  return (
    <BookingInvoice
      booking={booking}
      roomName={roomName}
      property={property}
      charges={charges}
      chargesTotal={chargesTotal}
      advance={advance}
      balance={balance}
      guestView={true}
    />
  );
}

function ContactProperty({
  propertyId, booking, totalAmount, advancePaid, showUPI,
}: {
  propertyId: string;
  booking: any;
  totalAmount: number;
  advancePaid: number;
  showUPI: boolean;
}) {
  const { data: property } = useQuery({
    queryKey: ["property-contact", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("name, area, owner_name, owner_phone, owner_whatsapp, location_lat, location_lng, shared_amenities")
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
      {upiId && showUPI && (
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
          {property.owner_name && (
            <div className="text-muted-foreground text-xs mt-0.5">Host: {property.owner_name}</div>
          )}
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
