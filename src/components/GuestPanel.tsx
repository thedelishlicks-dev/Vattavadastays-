import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useGuestStays } from "@/hooks/useGuestStays";
import { returningLabel } from "@/lib/guestIdentity";

// The guest at the top of a booking's Overview: name, phone, email and, for a returning guest, one simple line
// ("Returning guest · 3 stays"). Tap it for first stay / last stay / total revenue. Not a CRM: no list, no search.
// The guest's stays load only when a booking is open (useGuestStays), and only if it has a guest record.

const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const date = (ymd: string | null) =>
  ymd
    ? new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export function GuestPanel({
  propertyId,
  guestId,
  name,
  phone,
  email,
}: {
  propertyId: string;
  /** The booking's guest_id; null for a booking with no usable phone (no guest record). */
  guestId: string | null | undefined;
  name: string;
  phone?: string | null;
  email?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { stats, isLoading, isError } = useGuestStays(propertyId, guestId);
  const label = stats ? returningLabel(stats.stays) : null;

  return (
    <section className="rounded-2xl bg-muted/50 px-4 py-3 space-y-1.5" aria-label="Guest">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Guest</p>
          <p className="font-semibold truncate">{name}</p>
        </div>
        {label && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {label}
          </span>
        )}
      </div>
      {(phone || email) && (
        <p className="text-sm text-muted-foreground break-words">
          {phone && <span>{phone}</span>}
          {phone && email && <span> · </span>}
          {email && <span>{email}</span>}
        </p>
      )}
      {!guestId && (
        <p className="text-xs text-muted-foreground">
          No phone number, so stays can't be matched to this guest.
        </p>
      )}
      {guestId && isLoading && (
        <p className="text-xs text-muted-foreground">Checking previous stays…</p>
      )}
      {guestId && isError && (
        <p className="text-xs text-muted-foreground">Couldn't load this guest's history.</p>
      )}
      {stats && stats.stays > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            Guest history{" "}
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {open && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Total stays</dt>
                <dd className="font-semibold tabular-nums">{stats.stays}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total revenue</dt>
                <dd className="font-semibold tabular-nums">{money(stats.revenue)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">First stay</dt>
                <dd>{date(stats.firstStay)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last stay</dt>
                <dd>{date(stats.lastStay)}</dd>
              </div>
              <p className="col-span-2 text-[11px] text-muted-foreground">
                Confirmed and completed stays only (a multi-room booking counts once). Revenue is
                what the stays were worth, not what has been paid.
              </p>
            </dl>
          )}
        </>
      )}
    </section>
  );
}
