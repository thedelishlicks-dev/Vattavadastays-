// src/components/QuoteBuilder.tsx
//
// Builds a quote while the guest is on the phone: dates → rooms → add-ons /
// packages → discount → "Send on WhatsApp". The send button is a real <a>
// link (not window.open) so iPad/iPhone Safari never blocks it, and it works
// even if the background save fails on a weak signal.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Minus, Plus, Send, Trash2, TriangleAlert } from "lucide-react";
import { Section, Field, inputCls } from "@/admin/formKit";
import { supabase } from "@/lib/supabase";
import { getConflictingDates } from "@/lib/bookingAvailability";
import { useAddons, usePackages, useSeasons } from "@/hooks/useCatalog";
import { useSaveQuote, type Quote, type QuoteInputs } from "@/hooks/useQuotes";
import {
  formatINR, nightsBetween, packageIncludes, packageSaving, priceLine, quoteWarnings, sumQuote, stayDates,
  UNIT_LABELS, type Addon, type Package, type QuoteLine,
} from "@/lib/quotes";
import { buildQuoteText, priceRoomStay, quoteLink, todayStr, type QuoteRoom } from "@/lib/quoteBuilder";

type ItemInput = QuoteInputs["items"][number];

interface BuilderProperty {
  id: string;
  name: string;
  owner_phone?: string;
  rooms?: (QuoteRoom & { is_active?: boolean })[];
  [k: string]: unknown;
}

export function QuoteBuilder({ property, initial, onClose }: { property: BuilderProperty; initial?: Quote; onClose: () => void }) {
  const { data: seasons = [] } = useSeasons(property.id);
  const { data: addons = [] } = useAddons(property.id);
  const { data: packages = [] } = usePackages(property.id);
  const save = useSaveQuote();

  const rooms = (property.rooms ?? []).filter((r) => r.is_active !== false);

  // ── form state (seeded from an existing quote when editing)
  const [guestName, setGuestName] = useState(initial?.guest_name === "Guest" ? "" : (initial?.guest_name ?? ""));
  const [guestPhone, setGuestPhone] = useState(initial?.guest_phone ?? "");
  const [checkIn, setCheckIn] = useState(initial?.check_in ?? "");
  const [checkOut, setCheckOut] = useState(initial?.check_out ?? "");
  const [roomSel, setRoomSel] = useState<Record<string, number>>(
    Object.fromEntries((initial?.inputs.rooms ?? []).map((r) => [r.room_id, r.guests])),
  );
  const [items, setItems] = useState<ItemInput[]>(initial?.inputs.items ?? []);
  const [discount, setDiscount] = useState(initial?.discount_amount ? String(initial.discount_amount) : "");
  const [validUntil, setValidUntil] = useState(initial?.valid_until ?? todayStr(3));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [savedId, setSavedId] = useState<string | undefined>(initial?.id);
  const [saveMsg, setSaveMsg] = useState("");

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const datesOk = !!checkIn && !!checkOut && nights > 0;
  const selectedRoomIds = Object.keys(roomSel);

  // ── per-date room price overrides (same source the guest flow reads)
  const { data: overrideRows = [] } = useQuery({
    queryKey: ["quote-overrides", selectedRoomIds.join(","), checkIn, checkOut],
    enabled: datesOk && selectedRoomIds.length > 0,
    queryFn: async () => {
      const dates = stayDates(checkIn, checkOut);
      const { data, error } = await supabase
        .from("availability")
        .select("room_id, date, price_override")
        .in("room_id", selectedRoomIds)
        .in("date", dates);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── soft availability warning (a quote never blocks dates)
  const { data: conflicts = {} } = useQuery({
    queryKey: ["quote-conflicts", property.id, selectedRoomIds.join(","), checkIn, checkOut],
    enabled: datesOk && selectedRoomIds.length > 0,
    queryFn: async () => {
      const out: Record<string, string[]> = {};
      for (const id of selectedRoomIds) out[id] = await getConflictingDates(id, checkIn, checkOut, property as never);
      return out;
    },
  });

  // ── pricing
  const roomLines = useMemo(
    () =>
      rooms
        .filter((r) => r.id in roomSel)
        .map((room) => {
          const overrides: Record<string, number> = {};
          for (const o of overrideRows) if (o.room_id === room.id && o.price_override) overrides[o.date] = Number(o.price_override);
          return priceRoomStay({ room, guests: roomSel[room.id], checkIn, checkOut, overrides });
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rooms.length, roomSel, checkIn, checkOut, overrideRows],
  );

  const guestCount = Math.max(1, Object.values(roomSel).reduce((s, n) => s + n, 0));

  const priced = useMemo(() => {
    return items.map((it) => {
      const item = it.kind === "package" ? packages.find((p) => p.id === it.item_id) : addons.find((a) => a.id === it.item_id);
      if (!item || item.variants.length === 0) return { it, item: undefined, line: undefined as QuoteLine | undefined };
      const line = priceLine({
        kind: it.kind,
        item,
        variantKey: it.variant_key,
        checkIn: checkIn || todayStr(),
        checkOut: checkOut || checkIn || todayStr(),
        guests: guestCount,
        seasons,
        quantityOverride: it.qty,
        unitPriceOverride: it.price,
        includes: it.kind === "package" ? packageIncludes(item as Package, addons) : [],
      });
      return { it, item, line };
    });
  }, [items, packages, addons, seasons, checkIn, checkOut, guestCount]);

  const lines = priced.map((p) => p.line).filter((l): l is QuoteLine => !!l);
  const discountNum = Math.max(0, Number(discount) || 0);
  const totals = sumQuote({ lines, roomsTotal: roomLines.reduce((s, r) => s + r.total, 0), discount: discountNum });
  const warnings = quoteWarnings(lines);

  const phoneDigits = guestPhone.replace(/\D/g, "");
  const phoneOk = phoneDigits.length >= 10;
  const canSend = datesOk && phoneOk && roomLines.length > 0;

  const text = buildQuoteText({
    propertyName: property.name, guestName, checkIn, checkOut, guestCount,
    rooms: roomLines, lines, discount: totals.discount, total: totals.total,
    validUntil: validUntil || null, ownerPhone: property.owner_phone,
  });
  const link = phoneOk ? quoteLink(guestPhone, text) : "#";

  // ── save (draft or sent). Fire-and-forget safe: sending never waits on this.
  const persist = async (status: "draft" | "sent") => {
    if (!canSend) return;
    const values: Record<string, unknown> = {
      guest_name: guestName.trim() || "Guest",
      guest_phone: phoneDigits,
      check_in: checkIn,
      check_out: checkOut,
      guest_count: guestCount,
      inputs: { rooms: Object.entries(roomSel).map(([room_id, guests]) => ({ room_id, guests })), items },
      rooms: roomLines,
      lines,
      rooms_total: totals.roomsTotal,
      addons_total: totals.addonsTotal,
      discount_amount: totals.discount,
      total_amount: totals.total,
      valid_until: validUntil || null,
      notes: notes.trim() || null,
      status: status === "sent" ? "sent" : (initial?.status ?? "draft"),
    };
    if (status === "sent") values.sent_at = new Date().toISOString();
    try {
      const id = await save.mutateAsync({ propertyId: property.id, id: savedId, values });
      setSavedId(id);
      setSaveMsg(status === "sent" ? "Saved as sent" : "Draft saved");
    } catch {
      setSaveMsg("Couldn't save — your message was still sent. Try Save again.");
    }
  };

  // ── item helpers
  const patchItem = (idx: number, patch: Partial<ItemInput>) =>
    setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  const addCatalogItem = (value: string) => {
    if (!value) return;
    const [kind, id] = value.split(":") as ["addon" | "package", string];
    const item = kind === "package" ? packages.find((p) => p.id === id) : addons.find((a) => a.id === id);
    if (!item) return;
    setItems((arr) => [...arr, { kind, item_id: id, variant_key: item.variants[0]?.key ?? null }]);
  };

  const toggleRoom = (r: QuoteRoom) =>
    setRoomSel((s) => {
      const next = { ...s };
      if (r.id in next) delete next[r.id];
      else next[r.id] = Math.min(2, r.max_guests) || 1;
      return next;
    });

  const activePackages = packages.filter((p) => p.is_active);
  const activeAddons = addons.filter((a) => a.is_active);

  return (
    <div className="space-y-5 max-w-2xl pb-8">
      <button onClick={onClose} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All quotes
      </button>
      <h1 className="font-display text-2xl font-semibold">{initial ? "Edit quote" : "New quote"}</h1>

      <Section title="Guest">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name (optional)">
            <input className={inputCls} value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          </Field>
          <Field label="WhatsApp number">
            <input className={inputCls} inputMode="tel" placeholder="98765 43210" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Stay">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in">
            <input type="date" className={inputCls} value={checkIn} onChange={(e) => {
              setCheckIn(e.target.value);
              if (checkOut && e.target.value >= checkOut) setCheckOut("");
            }} />
          </Field>
          <Field label="Check-out">
            <input type="date" className={inputCls} min={checkIn || undefined} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </Field>
        </div>
        {datesOk && <p className="text-sm text-muted-foreground">{nights} night{nights > 1 ? "s" : ""}</p>}
      </Section>

      <Section title="Rooms" description="Tap to include a room. Set how many guests will stay in each.">
        {rooms.length === 0 && <p className="text-sm text-muted-foreground">No active rooms found.</p>}
        <div className="space-y-2">
          {rooms.map((r) => {
            const on = r.id in roomSel;
            const line = roomLines.find((l) => l.room_id === r.id);
            const clash = conflicts[r.id] ?? [];
            return (
              <div key={r.id} className={`rounded-lg border p-3 ${on ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                <button onClick={() => toggleRoom(r)} className="w-full flex items-center justify-between text-left gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatINR(r.base_price)}/night · {r.max_guests} guests included
                    </div>
                  </div>
                  <span className={`h-5 w-5 rounded-full border shrink-0 ${on ? "bg-primary border-primary" : "border-border"}`} />
                </button>
                {on && (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2">
                      <button onClick={() => setRoomSel((s) => ({ ...s, [r.id]: Math.max(1, s[r.id] - 1) }))} className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border" aria-label="Fewer guests"><Minus className="h-4 w-4" /></button>
                      <span className="w-20 text-center text-sm">{roomSel[r.id]} guest{roomSel[r.id] > 1 ? "s" : ""}</span>
                      <button onClick={() => setRoomSel((s) => ({ ...s, [r.id]: s[r.id] + 1 }))} className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border" aria-label="More guests"><Plus className="h-4 w-4" /></button>
                    </div>
                    {datesOk && line && <div className="text-sm font-semibold">{formatINR(line.total)}</div>}
                  </div>
                )}
                {on && datesOk && line && (line.weekend_nights > 0 || line.override_nights > 0 || line.extra_guest_charge > 0) && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {[
                      line.weekend_nights > 0 && `${line.weekend_nights} weekend night${line.weekend_nights > 1 ? "s" : ""}`,
                      line.override_nights > 0 && `${line.override_nights} special-price night${line.override_nights > 1 ? "s" : ""}`,
                      line.extra_guest_charge > 0 && `extra guest charge ${formatINR(line.extra_guest_charge)}`,
                    ].filter(Boolean).join(" · ")}
                  </p>
                )}
                {on && clash.length > 0 && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                    <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Already booked on {clash.slice(0, 3).join(", ")}{clash.length > 3 ? "…" : ""}. You can still quote, but check before promising.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Add-ons & packages" description="Meals, campfire, kitchen, trekking… priced for the season of these dates.">
        {activePackages.length + activeAddons.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in your catalog yet — add items on the Add-ons page.</p>
        ) : (
          <select className={inputCls} value="" onChange={(e) => addCatalogItem(e.target.value)} disabled={!datesOk}>
            <option value="">{datesOk ? "＋ Add a package or add-on…" : "Pick dates first"}</option>
            {activePackages.length > 0 && (
              <optgroup label="Packages">
                {activePackages.map((p) => <option key={p.id} value={`package:${p.id}`}>{p.name}</option>)}
              </optgroup>
            )}
            {activeAddons.length > 0 && (
              <optgroup label="Add-ons">
                {activeAddons.map((a) => <option key={a.id} value={`addon:${a.id}`}>{a.name}</option>)}
              </optgroup>
            )}
          </select>
        )}

        <div className="space-y-3">
          {priced.map(({ it, item, line }, idx) => (
            <div key={idx} className="rounded-lg border border-border p-3 space-y-3">
              {!item || !line ? (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>This item was removed from your catalog.</span>
                  <button onClick={() => setItems((a) => a.filter((_, i) => i !== idx))} className="text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{it.kind === "package" ? "🎁 " : ""}{item.name}</div>
                      <div className="text-xs text-muted-foreground">{UNIT_LABELS[item.unit]}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-semibold">{formatINR(line.subtotal)}</span>
                      <button onClick={() => setItems((a) => a.filter((_, i) => i !== idx))} className="text-destructive" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>

                  {item.variants.length > 1 && (
                    <select className={inputCls} value={line.variant_key ?? ""} onChange={(e) => patchItem(idx, { variant_key: e.target.value })}>
                      {item.variants.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                    </select>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Field label={item.unit === "per_person_day" || item.unit === "per_person" ? "Guests" : "Quantity"}>
                      <input type="number" min={0} className={inputCls} placeholder={String(line.multiplier)} value={it.qty ?? ""} onChange={(e) => patchItem(idx, { qty: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} />
                    </Field>
                    <Field label="Price ₹ (override)">
                      <input type="number" min={0} className={inputCls} placeholder={String(line.breakdown[0]?.unit_price ?? 0)} value={it.price ?? ""} onChange={(e) => patchItem(idx, { price: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} />
                    </Field>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    {line.breakdown.map((s) => `${s.days} × ${formatINR(s.unit_price)}${s.season_name && s.source !== "override" ? ` (${s.season_name}${s.source === "base_fallback" ? ", base used" : ""})` : ""}`).join(" + ")}
                    {line.multiplier !== 1 ? ` × ${line.multiplier}` : ""}
                  </p>
                  {it.kind === "package" && (() => {
                    const s = packageSaving(item as Package, addons as Addon[], { variantKey: line.variant_key, checkIn, checkOut, guests: guestCount, seasons });
                    return (
                      <>
                        {line.includes.length > 0 && <p className="text-[11px] text-muted-foreground">Includes: {line.includes.join(" · ")}</p>}
                        {s.saving > 0 && <p className="text-[11px] text-primary">Guest saves {formatINR(s.saving)} vs buying separately</p>}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Discount & validity">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Discount ₹">
            <input type="number" min={0} className={inputCls} value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </Field>
          <Field label="Quote valid until">
            <input type="date" className={inputCls} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>
        </div>
        <Field label="Private note (not sent)">
          <input className={inputCls} placeholder="e.g. Family of 4, wants veg only" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Section>

      <Section title="Summary">
        <div className="space-y-1.5 text-sm">
          <Row label="Rooms" value={formatINR(totals.roomsTotal)} />
          {totals.addonsTotal > 0 && <Row label="Add-ons & packages" value={formatINR(totals.addonsTotal)} />}
          {totals.discount > 0 && <Row label="Discount" value={`−${formatINR(totals.discount)}`} />}
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <span>Total</span><span>{formatINR(totals.total)}</span>
          </div>
        </div>
        {warnings.length > 0 && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900 space-y-1">
            {warnings.map((w) => <p key={w} className="flex gap-1.5"><TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-px" />{w}</p>)}
          </div>
        )}
        {canSend && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Preview message</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs font-sans">{text}</pre>
          </details>
        )}
      </Section>

      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!canSend}
          onClick={(e) => { if (!canSend) { e.preventDefault(); return; } void persist("sent"); }}
          className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 font-medium ${canSend ? "bg-[#25D366] text-white hover:opacity-90" : "bg-muted text-muted-foreground pointer-events-none"}`}
        >
          <Send className="h-4 w-4" /> Send on WhatsApp
        </a>
        <button
          onClick={() => void persist("draft")}
          disabled={!canSend || save.isPending}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-6 py-3 font-medium hover:bg-muted disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save draft
        </button>
      </div>
      {!canSend && (
        <p className="text-xs text-muted-foreground">
          Needs: {[!phoneOk && "guest phone", !datesOk && "valid dates", roomLines.length === 0 && "at least one room"].filter(Boolean).join(", ")}.
        </p>
      )}
      {saveMsg && <p className="text-sm text-muted-foreground">{saveMsg}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}
