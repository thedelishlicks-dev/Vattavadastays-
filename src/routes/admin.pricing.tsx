import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader, Section, Field, inputCls, SaveBar } from "@/admin/formKit";

export const Route = createFileRoute("/admin/pricing")({
  component: PricingPage,
});

type RoomTypeKey = "Deluxe" | "Standard" | "Family" | "Dormitory";
type SeasonalRule = { id: string; label: string; from: string; to: string; multiplier: number };

function PricingPage() {
  const [base, setBase] = useState<Record<RoomTypeKey, number>>({
    Deluxe: 2500,
    Standard: 1800,
    Family: 3500,
    Dormitory: 800,
  });
  const [extraBed, setExtraBed] = useState<Record<RoomTypeKey, number>>({
    Deluxe: 600,
    Standard: 500,
    Family: 700,
    Dormitory: 0,
  });
  const [weekend, setWeekend] = useState(1.25);
  const [adultExtra, setAdultExtra] = useState(500);
  const [childExtra, setChildExtra] = useState(300);
  const [cleaning, setCleaning] = useState(300);
  const [rules, setRules] = useState<SeasonalRule[]>([
    {
      id: "r1",
      label: "Christmas / New Year",
      from: "2026-12-20",
      to: "2027-01-05",
      multiplier: 1.5,
    },
    { id: "r2", label: "Onam", from: "2026-09-01", to: "2026-09-10", multiplier: 1.3 },
  ]);
  const [dirty, setDirty] = useState(false);
  const mark = () => setDirty(true);

  const addRule = () => {
    setRules((r) => [
      ...r,
      { id: crypto.randomUUID(), label: "New season", from: "", to: "", multiplier: 1.2 },
    ]);
    mark();
  };
  const removeRule = (id: string) => {
    setRules((r) => r.filter((x) => x.id !== id));
    mark();
  };
  const updateRule = (id: string, patch: Partial<SeasonalRule>) => {
    setRules((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    mark();
  };

  const types: RoomTypeKey[] = ["Deluxe", "Standard", "Family", "Dormitory"];

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Pricing" subtitle="Base rates, multipliers, and extra charges." />

      <Section title="Base price per room type" description="Per night, before any multipliers.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {types.map((t) => (
            <Field key={t} label={t}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  ₹
                </span>
                <input
                  type="number"
                  value={base[t]}
                  onChange={(e) => {
                    setBase({ ...base, [t]: +e.target.value });
                    mark();
                  }}
                  className={`${inputCls} pl-7`}
                />
              </div>
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Multipliers">
        <Field label="Weekend multiplier (Fri–Sat)" hint="Applied on top of base price.">
          <input
            type="number"
            step="0.05"
            value={weekend}
            onChange={(e) => {
              setWeekend(+e.target.value);
              mark();
            }}
            className={`${inputCls} max-w-[160px]`}
          />
        </Field>
      </Section>

      <Section
        title="Seasonal rules"
        description="Date ranges that override the weekend multiplier."
      >
        <div className="space-y-3">
          {rules.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-border rounded-lg p-3"
            >
              <div className="md:col-span-4">
                <Field label="Label">
                  <input
                    value={r.label}
                    onChange={(e) => updateRule(r.id, { label: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="md:col-span-3">
                <Field label="From">
                  <input
                    type="date"
                    value={r.from}
                    onChange={(e) => updateRule(r.id, { from: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="md:col-span-3">
                <Field label="To">
                  <input
                    type="date"
                    value={r.to}
                    onChange={(e) => updateRule(r.id, { to: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="md:col-span-1">
                <Field label="×">
                  <input
                    type="number"
                    step="0.05"
                    value={r.multiplier}
                    onChange={(e) => updateRule(r.id, { multiplier: +e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="md:col-span-1 flex md:justify-end">
                <button
                  onClick={() => removeRule(r.id)}
                  className="h-10 w-10 rounded-md border border-border text-destructive hover:bg-destructive/10 inline-flex items-center justify-center"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={addRule}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <Plus className="h-4 w-4" /> Add seasonal rule
          </button>
        </div>
      </Section>

      <Section title="Extra guest charges" description="Per night, on top of room price.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Adult">
            <input
              type="number"
              value={adultExtra}
              onChange={(e) => {
                setAdultExtra(+e.target.value);
                mark();
              }}
              className={inputCls}
            />
          </Field>
          <Field label="Child">
            <input
              type="number"
              value={childExtra}
              onChange={(e) => {
                setChildExtra(+e.target.value);
                mark();
              }}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      <Section title="Extra bed price per room type">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {types.map((t) => (
            <Field key={t} label={t}>
              <input
                type="number"
                value={extraBed[t]}
                onChange={(e) => {
                  setExtraBed({ ...extraBed, [t]: +e.target.value });
                  mark();
                }}
                className={inputCls}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Cleaning fee">
        <Field label="Per booking" hint="Charged once per stay.">
          <input
            type="number"
            value={cleaning}
            onChange={(e) => {
              setCleaning(+e.target.value);
              mark();
            }}
            className={`${inputCls} max-w-[160px]`}
          />
        </Field>
      </Section>

      <SaveBar dirty={dirty} onSave={() => setDirty(false)} />
    </div>
  );
}
