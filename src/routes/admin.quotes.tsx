import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarCheck, MessageSquareText, Pencil, Phone, Plus, Send, Trash2 } from "lucide-react";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useDeleteQuote, useMarkQuoteConverted, useQuotes, useSetQuoteStatus, type Quote } from "@/hooks/useQuotes";
import { AddBookingModal } from "@/components/AddBookingModal";
import { QuoteBuilder } from "@/components/QuoteBuilder";
import { PageHeader } from "@/admin/formKit";
import { formatINR, nightsBetween } from "@/lib/quotes";
import { buildQuoteText, displayStatus, quoteLink, type DisplayStatus } from "@/lib/quoteBuilder";
import { telLink } from "@/lib/whatsapp";

export const Route = createFileRoute("/admin/quotes")({
  component: AdminQuotes,
});

const STATUS_STYLE: Record<DisplayStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-800",
  expired: "bg-amber-100 text-amber-800",
  accepted: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: "Draft", sent: "Sent", expired: "Expired", accepted: "Accepted", lost: "Lost",
};

type Filter = "open" | "accepted" | "lost" | "all";

function ago(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

function AdminQuotes() {
  const { data: property, isLoading } = useOwnerProperty();
  const [editing, setEditing] = useState<Quote | "new" | null>(null);

  if (isLoading || !property) return <div className="h-48 rounded-xl bg-muted animate-pulse" />;

  if (editing) {
    return (
      <QuoteBuilder
        key={editing === "new" ? "new" : editing.id}
        property={property as never}
        initial={editing === "new" ? undefined : editing}
        onClose={() => setEditing(null)}
      />
    );
  }
  return <QuoteList property={property as never} onEdit={setEditing} />;
}

type ListProperty = { id: string; name: string; owner_phone?: string; rooms?: { id: string; is_active?: boolean }[]; [k: string]: unknown };

function QuoteList({ property, onEdit }: { property: ListProperty; onEdit: (q: Quote | "new") => void }) {
  const { data: quotes = [], isLoading } = useQuotes(property.id);
  const setStatus = useSetQuoteStatus();
  const del = useDeleteQuote();
  const markConverted = useMarkQuoteConverted();
  const [converting, setConverting] = useState<Quote | null>(null);
  const [filter, setFilter] = useState<Filter>("open");

  const shown = quotes.filter((q) => {
    if (filter === "all") return true;
    if (filter === "open") return q.status === "draft" || q.status === "sent";
    return q.status === filter;
  });

  const resendLink = (q: Quote) =>
    quoteLink(
      q.guest_phone,
      buildQuoteText({
        propertyName: property.name, guestName: q.guest_name === "Guest" ? "" : q.guest_name,
        checkIn: q.check_in, checkOut: q.check_out, guestCount: q.guest_count,
        rooms: q.rooms, lines: q.lines, discount: q.discount_amount, total: q.total_amount,
        validUntil: q.valid_until, ownerPhone: property.owner_phone,
      }),
    );

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Quotes" subtitle="Price an enquiry while the guest is on the phone, then send it on WhatsApp." />
        <button
          onClick={() => onEdit("new")}
          className="shrink-0 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New quote
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {(["open", "accepted", "lost", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm capitalize border ${filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading && <div className="h-24 rounded-xl bg-muted animate-pulse" />}

      {!isLoading && shown.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <MessageSquareText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          {quotes.length === 0 ? "No quotes yet. Tap “New quote” when the next enquiry call comes in." : "Nothing in this view."}
        </div>
      )}

      <div className="space-y-3">
        {shown.map((q) => {
          const st = displayStatus(q);
          const n = nightsBetween(q.check_in, q.check_out);
          return (
            <div key={q.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{q.guest_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {q.check_in} → {q.check_out} · {n} night{n === 1 ? "" : "s"} · {q.guest_count} guest{q.guest_count === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{formatINR(q.total_amount)}</div>
                  <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[st]}`}>
                    {q.converted_booking_id ? "Booked ✓" : STATUS_LABEL[st]}{st === "sent" && q.sent_at ? ` · ${ago(q.sent_at)}` : ""}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-sm">
                <a
                  href={resendLink(q)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setStatus.mutate({ propertyId: property.id, id: q.id, status: q.status === "draft" ? "sent" : q.status, markSent: true })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1.5 text-white"
                >
                  <Send className="h-3.5 w-3.5" /> {q.status === "draft" ? "Send" : "Resend"}
                </a>
                <a href={telLink(q.guest_phone)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 hover:bg-muted">
                  <Phone className="h-3.5 w-3.5" /> Call
                </a>
                <button onClick={() => onEdit(q)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 hover:bg-muted">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                {!q.converted_booking_id && q.status !== "lost" && (
                  <button onClick={() => setConverting(q)} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-primary-foreground hover:opacity-90">
                    <CalendarCheck className="h-3.5 w-3.5" /> Convert to booking
                  </button>
                )}
                {q.converted_booking_id && (
                  <Link to="/admin/bookings" className="inline-flex items-center gap-1.5 rounded-full border border-green-300 px-3 py-1.5 text-green-800 hover:bg-green-50">
                    <CalendarCheck className="h-3.5 w-3.5" /> View in Bookings
                  </Link>
                )}
                {!q.converted_booking_id && q.status !== "accepted" && (
                  <button onClick={() => setStatus.mutate({ propertyId: property.id, id: q.id, status: "accepted" })} className="rounded-full border border-green-300 px-3 py-1.5 text-green-800 hover:bg-green-50">
                    Accepted
                  </button>
                )}
                {!q.converted_booking_id && q.status !== "lost" && (
                  <button onClick={() => setStatus.mutate({ propertyId: property.id, id: q.id, status: "lost" })} className="rounded-full border border-border px-3 py-1.5 hover:bg-muted">
                    Lost
                  </button>
                )}
                <button
                  onClick={() => { if (window.confirm("Delete this quote?")) del.mutate({ propertyId: property.id, id: q.id }); }}
                  className="ml-auto inline-flex items-center justify-center h-8 w-8 rounded-full text-destructive hover:bg-muted"
                  aria-label="Delete quote"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {q.notes && <p className="text-xs text-muted-foreground">📝 {q.notes}</p>}
            </div>
          );
        })}
      </div>

      {converting && (
        <AddBookingModal
          propertyId={property.id}
          property={property as never}
          rooms={((property.rooms ?? []).filter((r) => r.is_active !== false)) as never}
          onClose={() => setConverting(null)}
          onSaved={() => setConverting(null)}
          fromQuote={{
            quoteId: converting.id,
            guestName: converting.guest_name === "Guest" ? "" : converting.guest_name,
            guestPhone: converting.guest_phone,
            checkIn: converting.check_in,
            checkOut: converting.check_out,
            guestCount: converting.guest_count,
            rooms: converting.rooms,
            lines: converting.lines,
            discount: converting.discount_amount,
            onConverted: (bookingId) =>
              markConverted.mutateAsync({ propertyId: property.id, id: converting.id, bookingId }),
          }}
        />
      )}
    </div>
  );
}
