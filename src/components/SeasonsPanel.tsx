// src/components/SeasonsPanel.tsx
//
// The ONE place owners define seasons (Rooms & Pricing → Seasons). A season is a name + dates
// (+ "every year" + priority). What it changes is set on the season itself:
//   • Room prices  — a rule for all rooms and/or one room: +30%, −20% or a fixed ₹ per night
//   • Add-on prices — the season is used for add-ons & packages (exact prices are then typed on
//     the Add-ons page; blanks use the base price, with the same "fill blanks" helper as before)
// A season with no room rule never changes a room price; a season not used for add-ons never
// changes an add-on price. This is the only Seasons screen (the room editor shows a room's season
// prices read-only; the Add-ons page only links here).
// Rules live in lib/roomRates.ts; the same rules run in SQL (stay_room_price).

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Loader2, Pencil, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyDbError } from "@/lib/dbErrors";
import { Section, Field, inputCls } from "@/admin/formKit";
import { useAddons, useBulkFillSeason, useDeleteRow, usePackages, useSeasons } from "@/hooks/useCatalog";
import { roomRatesKey, seasonRulesKey, useSeasonRules } from "@/hooks/useRoomRates";
import { coverageGaps, inSeason, type PriceSeason } from "@/lib/quotes";
import { describeRule, parseRule, rateBasePrice, type RateKind, type SeasonRoomRule } from "@/lib/roomRates";

interface RoomLite {
  id: string;
  name: string;
  base_price: number;
}

function fmt(date: string, withYear: boolean) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

interface Draft {
  id?: string;
  name: string;
  start_date: string;
  end_date: string;
  recurs_yearly: boolean;
  priority: number;
  for_addons: boolean;
  /** New seasons only: a quick "change all room prices by %" so a season takes one form, not two. */
  roomPercent: string;
}

const emptyDraft = (): Draft => ({ name: "", start_date: "", end_date: "", recurs_yearly: false, priority: 0, for_addons: true, roomPercent: "" });

/** Other seasons that share at least one day with the draft (checked day by day). */
function overlappingSeasons(draft: Draft, others: PriceSeason[]): PriceSeason[] {
  if (!draft.start_date || !draft.end_date) return [];
  const a = { start_date: draft.start_date, end_date: draft.end_date, recurs_yearly: draft.recurs_yearly };
  const DAY = 86400000;
  // One-off: its own nights. Repeating: the next two years (covers every one-off season still ahead).
  const startMs = draft.recurs_yearly ? Date.now() : Date.parse(`${draft.start_date}T00:00:00Z`);
  const endMs = draft.recurs_yearly ? startMs + 800 * DAY : Date.parse(`${draft.end_date}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];
  const days: string[] = [];
  for (let t = startMs; t <= endMs && days.length < 800; t += DAY) days.push(new Date(t).toISOString().slice(0, 10));
  return others.filter((o) => o.id !== draft.id).filter((o) => days.some((d) => inSeason(d, a) && inSeason(d, o)));
}

export function SeasonsPanel({ propertyId, rooms }: { propertyId: string; rooms: RoomLite[] }) {
  const qc = useQueryClient();
  const { data: seasons = [] } = useSeasons(propertyId);
  const { data: rules = [] } = useSeasonRules(propertyId);
  const { data: addons = [] } = useAddons(propertyId);
  const { data: packages = [] } = usePackages(propertyId);
  const remove = useDeleteRow("price_seasons");
  const fill = useBulkFillSeason();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [ruleFor, setRuleFor] = useState<string | null>(null); // season id whose room-price form is open
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pct, setPct] = useState("20");
  const [notice, setNotice] = useState("");

  const gaps = coverageGaps([...addons, ...packages], seasons);
  const overlaps = useMemo(() => (draft ? overlappingSeasons(draft, seasons) : []), [draft, seasons]);
  const roomName = (id: string | null) => (id === null ? "All rooms" : (rooms.find((r) => r.id === id)?.name ?? "Room"));

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["priceSeasons", propertyId] }),
      qc.invalidateQueries({ queryKey: seasonRulesKey(propertyId) }),
      qc.invalidateQueries({ queryKey: roomRatesKey(propertyId) }),
    ]);

  const saveSeason = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return setError("Give the season a name");
    if (!draft.start_date || !draft.end_date) return setError("Pick start and end dates");
    if (!draft.recurs_yearly && draft.end_date < draft.start_date) return setError("End date is before start date");
    let quick: { kind: RateKind; value: number } | null = null;
    if (!draft.id && draft.roomPercent.trim() !== "") {
      const p = parseRule({ kind: "percent", value: draft.roomPercent });
      if (!p.ok) return setError(p.error);
      quick = p.values;
    }
    setError("");
    setSaving(true);
    try {
      const values = {
        name: draft.name.trim(),
        start_date: draft.start_date,
        end_date: draft.end_date,
        recurs_yearly: draft.recurs_yearly,
        priority: draft.priority,
        for_addons: draft.for_addons,
      };
      if (draft.id) {
        const { error: err } = await supabase.from("price_seasons").update(values).eq("id", draft.id);
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.from("price_seasons").insert({ ...values, property_id: propertyId }).select("id").single();
        if (err) throw err;
        if (quick) {
          const { error: e2 } = await supabase
            .from("season_room_rules")
            .insert({ property_id: propertyId, season_id: data.id, room_id: null, ...quick });
          if (e2) throw e2;
        }
      }
      await refresh();
      setDraft(null);
    } catch (e) {
      setError(friendlyDbError(e, "Could not save this season."));
    } finally {
      setSaving(false);
    }
  };

  const deleteSeason = async (s: PriceSeason) => {
    if (!window.confirm(`Delete the "${s.name}" season? Its room prices and add-on prices will stop applying.`)) return;
    try {
      await remove.mutateAsync({ propertyId, id: s.id });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const deleteRule = async (r: SeasonRoomRule) => {
    if (!r.id) return;
    const { error: err } = await supabase.from("season_room_rules").delete().eq("id", r.id);
    if (err) return setError(friendlyDbError(err));
    await refresh();
  };

  const setUseForAddons = async (s: PriceSeason, on: boolean) => {
    const { error: err } = await supabase.from("price_seasons").update({ for_addons: on }).eq("id", s.id);
    if (err) return setError(friendlyDbError(err));
    await refresh();
  };

  const handleFill = async (s: PriceSeason, mode: "copy_base" | "add_pct") => {
    const p = parseFloat(pct);
    if (mode === "add_pct" && !(p > -100)) return setError("Enter a valid percentage");
    const msg =
      mode === "copy_base"
        ? `Fill every blank ${s.name} add-on price with the base price?`
        : `Fill every blank ${s.name} add-on price with base ${p >= 0 ? "+" : ""}${p}%? You can edit each number afterwards.`;
    if (!window.confirm(msg)) return;
    setError("");
    try {
      const n = await fill.mutateAsync({
        propertyId,
        seasonId: s.id,
        mode: mode === "copy_base" ? { type: "copy_base" } : { type: "add_pct", pct: p },
        addons,
        packages,
      });
      setNotice(n ? `Updated ${n} item${n > 1 ? "s" : ""}.` : "Nothing to fill.");
      setTimeout(() => setNotice(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fill prices");
    }
  };

  return (
    <Section
      title="Seasons"
      description="Peak seasons, festivals and off-season — set the dates once. For each season choose what changes: room prices, add-on & package prices, or both. Outside every season, normal prices apply."
    >
      {seasons.length === 0 && !draft && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          <CalendarRange className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          No seasons yet — every night uses the normal room price.
        </div>
      )}

      <div className="space-y-3">
        {seasons.map((s) => {
          const seasonRules = rules.filter((r) => r.season_id === s.id);
          const usesAddons = s.for_addons !== false;
          return (
            <div key={s.id} className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmt(s.start_date, !s.recurs_yearly)} – {fmt(s.end_date, !s.recurs_yearly)}
                    {s.recurs_yearly && <span className="ml-2 rounded-full bg-muted px-2 py-0.5">every year</span>}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => { setError(""); setDraft({ ...s, for_addons: usesAddons, roomPercent: "" }); }}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted"
                    aria-label={`Edit ${s.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteSeason(s)}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted text-destructive"
                    aria-label={`Delete ${s.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Rooms */}
              <div className="rounded-md bg-muted/40 p-2.5 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Room prices</div>
                {seasonRules.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No change — rooms keep their normal price in this season.</p>
                ) : (
                  <ul className="space-y-1">
                    {seasonRules.map((r) => (
                      <li key={r.id ?? `${r.room_id}`} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          <span className="font-medium">{roomName(r.room_id)}</span>{" "}
                          <span className="text-muted-foreground">{describeRule(r, rooms.find((x) => x.id === r.room_id)?.base_price)}</span>
                        </span>
                        <button onClick={() => deleteRule(r)} className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground" aria-label={`Remove ${roomName(r.room_id)} price`}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {ruleFor === s.id ? (
                  <RuleForm
                    propertyId={propertyId}
                    season={s}
                    rooms={rooms}
                    rules={seasonRules}
                    onDone={async () => { setRuleFor(null); await refresh(); }}
                    onCancel={() => setRuleFor(null)}
                  />
                ) : (
                  <button onClick={() => setRuleFor(s.id)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-muted">
                    <Plus className="h-3 w-3" /> {seasonRules.length ? "Add or change a room price" : "Set room prices"}
                  </button>
                )}
              </div>

              {/* Add-ons */}
              <div className="rounded-md bg-muted/40 p-2.5 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add-ons & packages</div>
                {usesAddons ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Each add-on and package can have its own price for this season (set on the Add-ons page). Blank = base price.
                    </p>
                    {gaps[s.id] > 0 && (
                      <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs space-y-2">
                        <p className="flex items-center gap-1.5 text-amber-900">
                          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                          {gaps[s.id]} price{gaps[s.id] > 1 ? "s" : ""} not set for {s.name} — base price will be used.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={() => handleFill(s, "copy_base")} disabled={fill.isPending} className="rounded-full border border-amber-300 bg-white px-3 py-1 hover:bg-amber-100">
                            Fill blanks with base price
                          </button>
                          <span className="inline-flex items-center gap-1">
                            <input type="number" value={pct} onChange={(e) => setPct(e.target.value)} className="h-7 w-16 rounded-md border border-amber-300 bg-white px-2 text-xs" aria-label="Percentage" />
                            <button onClick={() => handleFill(s, "add_pct")} disabled={fill.isPending} className="rounded-full border border-amber-300 bg-white px-3 py-1 hover:bg-amber-100">
                              Fill blanks: base + {pct || 0}%
                            </button>
                          </span>
                        </div>
                      </div>
                    )}
                    <button onClick={() => setUseForAddons(s, false)} className="text-xs text-muted-foreground underline">
                      Don't use this season for add-ons
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Not used — add-on and package prices do not change in this season.</p>
                    <button onClick={() => setUseForAddons(s, true)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-muted">
                      Use this season for add-ons too
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {draft ? (
        <div className="rounded-lg border border-primary/40 p-3 space-y-3">
          <Field label="Season name">
            <input className={inputCls} placeholder="e.g. Peak, Christmas–New Year, Onam" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <input type="date" className={inputCls} value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
            </Field>
            <Field label="Ends (last night included)">
              <input type="date" className={inputCls} value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={draft.recurs_yearly} onChange={(e) => setDraft({ ...draft, recurs_yearly: e.target.checked })} />
            <span>
              Repeats every year
              <span className="block text-xs text-muted-foreground">Use for fixed windows like Dec 20 – Jan 5. Leave off for festivals whose dates move each year.</span>
            </span>
          </label>

          {!draft.id && (
            <Field label="Room prices in this season (optional)" hint="Change all rooms by a percentage — for example 30 for 30% higher, -20 for 20% lower. Leave blank for no change; you can set exact prices per room afterwards.">
              <input className={inputCls} inputMode="numeric" placeholder="e.g. 30" value={draft.roomPercent} onChange={(e) => setDraft({ ...draft, roomPercent: e.target.value })} />
            </Field>
          )}
          {!draft.id && draft.roomPercent.trim() !== "" && parseRule({ kind: "percent", value: draft.roomPercent }).ok && (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {rooms.slice(0, 4).map((r) => (
                <li key={r.id}>
                  {r.name}: {inr(r.base_price)} → {inr(rateBasePrice({ room_id: null, start_date: "", end_date: "", kind: "percent", value: Math.round(parseFloat(draft.roomPercent)) }, r.base_price))} / night
                </li>
              ))}
            </ul>
          )}

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={draft.for_addons} onChange={(e) => setDraft({ ...draft, for_addons: e.target.checked })} />
            <span>
              Also use for add-ons & packages
              <span className="block text-xs text-muted-foreground">You can then give each add-on a price for this season on the Add-ons page.</span>
            </span>
          </label>

          {overlaps.length > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900 space-y-2">
              <p>
                <TriangleAlert className="inline h-3.5 w-3.5 mr-1 align-text-bottom" />
                Overlaps {overlaps.map((o) => `"${o.name}"`).join(", ")}. On shared dates the season with the <strong>higher priority</strong> wins; if equal, the <strong>shorter</strong> season wins.
              </p>
              <Field label="Priority" hint="Higher number wins. Leave at 0 to let the shorter season win.">
                <input type="number" className={inputCls} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: parseInt(e.target.value) || 0 })} />
              </Field>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setDraft(null); setError(""); }} className="rounded-full border border-border px-4 py-2 text-sm hover:bg-muted">
              Cancel
            </button>
            <button onClick={saveSeason} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save season
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setError(""); setDraft(emptyDraft()); }} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-muted">
          <Plus className="h-4 w-4" /> Add season
        </button>
      )}

      {!draft && error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-primary">{notice}</p>}
      <p className="text-[11px] text-muted-foreground">
        Room prices: the Fri/Sat weekend price still applies on top. A price for one room beats an "All rooms" price in the same season.
      </p>
    </Section>
  );
}

// ── Room price for one season: all rooms or one room ────────────────────────

function RuleForm({
  propertyId,
  season,
  rooms,
  rules,
  onDone,
  onCancel,
}: {
  propertyId: string;
  season: PriceSeason;
  rooms: RoomLite[];
  rules: SeasonRoomRule[];
  onDone: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [target, setTarget] = useState<string>("all");
  const [kind, setKind] = useState<RateKind>("percent");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const parsed = parseRule({ kind, value });
  const room = target === "all" ? null : rooms.find((r) => r.id === target) ?? null;
  const preview = parsed.ok
    ? (target === "all" ? rooms.slice(0, 3) : room ? [room] : []).map(
        (r) => `${r.name}: ${inr(r.base_price)} → ${inr(rateBasePrice({ room_id: null, start_date: "", end_date: "", kind, value: parsed.values.value }, r.base_price))}`,
      )
    : [];

  const save = async () => {
    if (!parsed.ok) return setError(parsed.error);
    setSaving(true);
    setError("");
    try {
      const roomId = target === "all" ? null : target;
      const existing = rules.find((r) => r.room_id === roomId);
      const { error: err } = existing?.id
        ? await supabase.from("season_room_rules").update(parsed.values).eq("id", existing.id)
        : await supabase.from("season_room_rules").insert({ property_id: propertyId, season_id: season.id, room_id: roomId, ...parsed.values });
      if (err) throw err;
      await onDone();
    } catch (e) {
      setError(friendlyDbError(e, "Could not save this price."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-background p-2.5 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <Field label="For">
          <select className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="all">All rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Price type">
          <select className={inputCls} value={kind} onChange={(e) => { setKind(e.target.value as RateKind); setValue(""); }}>
            <option value="percent">% change on base price</option>
            <option value="fixed">Fixed ₹ per night</option>
          </select>
        </Field>
      </div>
      <Field label={kind === "fixed" ? "₹ per night" : "% (e.g. 30 or -20)"}>
        <input className={inputCls} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "fixed" ? "4500" : "30"} />
      </Field>
      {preview.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-0.5">
          {preview.map((p) => (
            <li key={p}>{p} / night</li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-full border border-border py-1.5 text-xs hover:bg-muted">Cancel</button>
        <button onClick={save} disabled={saving || !parsed.ok} className="flex-1 rounded-full bg-primary text-primary-foreground py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />} Save price
        </button>
      </div>
    </div>
  );
}
