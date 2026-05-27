/**
 * BookingInvoice — shared between admin bookings modal and guest tracking page.
 * Owner sees: Copy text, Send to guest (WhatsApp), Print/PDF
 * Guest sees:  Copy text, Print/PDF only (no "Send to guest" button)
 */
import { useState } from "react";
import { Check, Copy, MessageCircle, Printer } from "lucide-react";
import type { BookingCharge } from "@/types/database";

interface InvoiceProps {
  booking: {
    id: string;
    guest_name: string;
    guest_phone: string;
    check_in: string;
    check_out: string;
    nights: number;
    guest_count: number;
    room_price: number;
    extra_guest_charge: number;
    total_amount: number;
    advance_amount: number;
    payment_method?: string | null;
    payment_reference?: string | null;
  };
  roomName: string;
  property: {
    name: string;
    area?: string | null;
    owner_name?: string | null;
    owner_phone?: string | null;
  } | null;
  charges: BookingCharge[];
  chargesTotal: number;
  advance: number;
  balance: number;
  /** Hide "Send to guest" WhatsApp button on guest-facing page */
  guestView?: boolean;
}

function InvLine({ label, amount, bold, large, color, muted }: {
  label: string; amount: number; bold?: boolean; large?: boolean; color?: string; muted?: boolean;
}) {
  return (
    <div className={`flex justify-between ${large ? "text-base" : "text-sm"} ${muted ? "text-muted-foreground" : ""}`}>
      <span className={bold ? "font-semibold" : ""}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold" : ""} ${color ?? ""}`}>
        {amount < 0 ? "-" : ""}₹{Math.abs(amount).toLocaleString("en-IN")}
      </span>
    </div>
  );
}

export function BookingInvoice({
  booking, roomName, property, charges, chargesTotal, advance, balance, guestView = false,
}: InvoiceProps) {
  const [copied, setCopied] = useState(false);

  const invoiceNum = `INV-${booking.id.slice(0, 6).toUpperCase()}`;
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const subtotal = Number(booking.total_amount) + chargesTotal;

  const invoiceText = [
    `━━━━━━━━━━━━━━━━━━`,
    `${property?.name ?? "VattavadaStays"}`,
    `Invoice: ${invoiceNum}  Date: ${today}`,
    `━━━━━━━━━━━━━━━━━━`,
    `Guest: ${booking.guest_name}`,
    `Phone: ${booking.guest_phone}`,
    `Room: ${roomName}`,
    `Check-in: ${booking.check_in}`,
    `Check-out: ${booking.check_out}`,
    `Nights: ${booking.nights}  Guests: ${booking.guest_count}`,
    `━━━━━━━━━━━━━━━━━━`,
    `Room charge      ₹${Number(booking.room_price).toLocaleString("en-IN")}`,
    Number(booking.extra_guest_charge) > 0
      ? `Extra guests     ₹${Number(booking.extra_guest_charge).toLocaleString("en-IN")}`
      : null,
    ...charges.map((c) => `${c.description.slice(0, 16).padEnd(16)} ₹${(c.qty * c.unit_price).toLocaleString("en-IN")}`),
    `━━━━━━━━━━━━━━━━━━`,
    `Subtotal         ₹${subtotal.toLocaleString("en-IN")}`,
    advance > 0 ? `Advance paid    -₹${advance.toLocaleString("en-IN")}` : null,
    `━━━━━━━━━━━━━━━━━━`,
    `BALANCE DUE      ₹${balance.toLocaleString("en-IN")}`,
    `━━━━━━━━━━━━━━━━━━`,
  ].filter(Boolean).join("\n");

  const handleCopy = () => {
    navigator.clipboard.writeText(invoiceText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const guestWaLink = `https://wa.me/${booking.guest_phone.replace(/\D/g, "")}?text=${encodeURIComponent(invoiceText)}`;

  return (
    <div className="space-y-4">
      {/* Invoice card */}
      <div className="rounded-xl border border-border bg-white p-5 space-y-4 font-mono text-sm">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-dashed border-border pb-3">
          <div>
            <div className="font-display font-semibold text-base not-italic">
              {property?.name ?? "VattavadaStays"}
            </div>
            {property?.area && (
              <div className="text-xs text-muted-foreground not-italic">{property.area}, Kerala</div>
            )}
          </div>
          <div className="text-right text-xs">
            <div className="font-semibold">{invoiceNum}</div>
            <div className="text-muted-foreground">{today}</div>
          </div>
        </div>

        {/* Guest + stay */}
        <div className="grid grid-cols-2 gap-2 text-xs border-b border-dashed border-border pb-3">
          <div>
            <div className="text-muted-foreground mb-0.5 not-italic">Guest</div>
            <div className="font-medium not-italic">{booking.guest_name}</div>
            <div className="text-muted-foreground">{booking.guest_phone}</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5 not-italic">Stay</div>
            <div className="font-medium not-italic">{roomName}</div>
            <div className="text-muted-foreground">{booking.check_in} → {booking.check_out}</div>
            <div className="text-muted-foreground">{booking.nights}N · {booking.guest_count} guests</div>
          </div>
        </div>

        {/* Line items */}
        <div className="space-y-1.5">
          <InvLine label="Room charge" amount={Number(booking.room_price)} />
          {Number(booking.extra_guest_charge) > 0 && (
            <InvLine label="Extra guest charge" amount={Number(booking.extra_guest_charge)} muted />
          )}
          {charges.map((c) => (
            <InvLine
              key={c.id}
              label={`${c.description}${c.qty > 1 ? ` ×${c.qty}` : ""}`}
              amount={c.qty * c.unit_price}
              muted
            />
          ))}
        </div>

        {/* Totals */}
        <div className="border-t border-dashed border-border pt-2 space-y-1.5">
          <InvLine label="Subtotal" amount={subtotal} bold />
          {advance > 0 && <InvLine label="Advance paid" amount={-advance} color="text-primary" />}
          <div className="border-t border-border pt-1.5">
            <InvLine
              label="BALANCE DUE"
              amount={balance}
              bold
              large
              color={balance === 0 ? "text-primary" : "text-amber-700"}
            />
          </div>
        </div>

        {/* Payment reference */}
        {booking.payment_reference && (
          <div className="text-xs text-muted-foreground border-t border-dashed border-border pt-2">
            Ref: {booking.payment_reference}
            {booking.payment_method && ` · ${booking.payment_method}`}
          </div>
        )}

        {/* Footer */}
        <div className="text-xs text-center text-muted-foreground border-t border-dashed border-border pt-2">
          {property?.owner_name && `Issued by ${property.owner_name}`}
          {property?.owner_phone && ` · +91 ${property.owner_phone.replace(/\D/g, "").slice(-10)}`}
        </div>
      </div>

      {/* Action buttons */}
      <div className={`grid gap-2 ${guestView ? "grid-cols-2" : "grid-cols-3"}`}>
        <button
          onClick={handleCopy}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-border py-3 px-2 text-xs font-medium hover:bg-muted transition-colors"
        >
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy text"}
        </button>

        {/* Send to guest — owner only */}
        {!guestView && (
          <a
            href={guestWaLink}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col items-center gap-1.5 rounded-xl bg-[#25D366] text-white py-3 px-2 text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <MessageCircle className="h-4 w-4" />
            Send to guest
          </a>
        )}

        <button
          onClick={() => window.print()}
          className="flex flex-col items-center gap-1.5 rounded-xl bg-primary text-primary-foreground py-3 px-2 text-xs font-medium hover:opacity-90 transition-opacity"
        >
          <Printer className="h-4 w-4" />
          Print/PDF
        </button>
      </div>
    </div>
  );
}
