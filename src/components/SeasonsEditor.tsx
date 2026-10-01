// src/components/SeasonsEditor.tsx
//
// "Seasons" section for the Pricing page. Seasons are defined ONCE per
// property and shared by every add-on and package (each item then carries an
// exact price per season). This editor also shows how many prices are still
// blank per season, with a one-time "fill blanks" helper that writes exact
// numbers — never a live percentage.

import { useState } from "react";
import { CalendarRange, Loader2, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Section, Field, inputCls } from "@/admin/formKit";
import { useAddons, useBulkFillSeason, useDeleteRow, usePackages, useSaveRow, useSeasons } from "@/hooks/useCatalog";
import { coverageGaps, type PriceSeason } from "@/lib/quotes";

function fmt(date: string, withYear: boolean) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

interface Draft {
  id?: string;
  name: string;
  start_date: string;
  end_date: string;
  recurs_yearly: boolean;
  priority: number;
}

const emptyDraft = (): Draft => ({ name: "", start_date: "", end_date: "", recurs_yearly: false, priority: 0 });

export function SeasonsEditor({ propertyId }: { propertyId: string }) {
  const { data: seasons = [] } = useSeasons(propertyId);
  const { data: addons = [] } = useAddons(propertyId);
  const { data: packages = [] } = usePackages(propertyId);
  const save = useSaveRow("price_seasons");
  const remove = useDeleteRow("price_seasons");
  const fill = useBulkFillSeason();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [pct, setPct] = useState("20");
  const [notice, setNotice] = useState("");

  const gaps = coverageGaps([...addons, ...packages], seasons);

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return setError("Give the season a name");
    if (!draft.start_date || !draft.end_date) return setError("Pick start and end dates");
    if (!draft.recurs_yearly && draft.end_date < draft.start_date) return setError("End date is before start date");
    setError("");
    try {
      await save.mutateAsync({
        propertyId,
        id: draft.id,
        values: {
          name: draft.name.trim(),
          start_date: draft.start_date,
          end_date: draft.end_date,
          recurs_yearly: draft.recurs_yearly,
          priority: draft.priority,
        },
      });
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const handleDelete = async (s: PriceSeason) => {
    if (!window.confirm(`Delete the "${s.name}" season? Prices entered for it will no longer apply.`)) return;
    try {
      await remove.mutateAsync({ propertyId, id: s.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleFill = async (s: PriceSeason, mode: "copy_base" | "add_pct") => {
    const p = parseFloat(pct);
    if (mode === "add_pct" && !(p > -100)) return setError("Enter a valid percentage");
    const msg =
      mode === "copy_base"
        ? `Fill every blank ${s.name} price with the base price?`
        : `Fill every blank ${s.name} price with base ${p >= 0 ? "+" : ""}${p}%? You can edit each number afterwards.`;
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
      title="Seasons for add-ons & packages"
      description="Define peak seasons and festivals once. Each add-on and package then gets its own exact price for every season (set on the Add-ons page). A blank price means the base price is used."
    >
      {seasons.length === 0 && !draft && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          <CalendarRange className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          No seasons yet — add-ons will use their base price all year.
        </div>
      )}

      <div className="space-y-3">
        {seasons.map((s) => (
          <div key={s.id} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {fmt(s.start_date, !s.recurs_yearly)} – {fmt(s.end_date, !s.recurs_yearly)}
                  {s.recurs_yearly && (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5">every year</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => setDraft({ ...s })}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted"
                  aria-label={`Edit ${s.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(s)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted text-destructive"
                  aria-label={`Delete ${s.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {gaps[s.id] > 0 && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs space-y-2">
                <p className="flex items-center gap-1.5 text-amber-900">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  {gaps[s.id]} price{gaps[s.id] > 1 ? "s" : ""} not set for {s.name} — base price will be used.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleFill(s, "copy_base")}
                    disabled={fill.isPending}
                    className="rounded-full border border-amber-300 bg-white px-3 py-1 hover:bg-amber-100"
                  >
                    Fill blanks with base price
                  </button>
                  <span className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      value={pct}
                      onChange={(e) => setPct(e.target.value)}
                      className="h-7 w-16 rounded-md border border-amber-300 bg-white px-2 text-xs"
                      aria-label="Percentage"
                    />
                    <button
                      onClick={() => handleFill(s, "add_pct")}
                      disabled={fill.isPending}
                      className="rounded-full border border-amber-300 bg-white px-3 py-1 hover:bg-amber-100"
                    >
                      Fill blanks: base + {pct || 0}%
                    </button>
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {draft ? (
        <div className="rounded-lg border border-primary/40 p-3 space-y-3">
          <Field label="Season name">
            <input
              className={inputCls}
              placeholder="e.g. Peak, Christmas–New Year, Onam"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <input type="date" className={inputCls} value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
            </Field>
            <Field label="Ends">
              <input type="date" className={inputCls} value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={draft.recurs_yearly}
              onChange={(e) => setDraft({ ...draft, recurs_yearly: e.target.checked })}
            />
            <span>
              Repeats every year
              <span className="block text-xs text-muted-foreground">
                Use for fixed windows like Dec 20 – Jan 5. Leave off for festivals whose dates move each year.
              </span>
            </span>
          </label>
          <Field
            label="Priority"
            hint="Only matters if seasons overlap. Higher wins; if equal, the shorter season wins."
          >
            <input
              type="number"
              className={inputCls}
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: parseInt(e.target.value) || 0 })}
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setDraft(null); setError(""); }}
              className="rounded-full border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={save.isPending}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save season
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setDraft(emptyDraft())}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          <Plus className="h-4 w-4" /> Add season
        </button>
      )}

      {!draft && error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-primary">{notice}</p>}
    </Section>
  );
}
