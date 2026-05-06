import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Section, Field, inputCls, SaveBar } from "@/admin/formKit";

export const Route = createFileRoute("/admin/policies")({ component: PoliciesPage });

type CancelPolicy = "Flexible" | "Medium" | "Strict";

function PoliciesPage() {
  const [checkIn, setCheckIn] = useState("13:00");
  const [checkOut, setCheckOut] = useState("11:00");
  const [policy, setPolicy] = useState<CancelPolicy>("Medium");
  const refundPresets: Record<CancelPolicy, { label: string; pct: number }[]> = {
    Flexible: [
      { label: "More than 24h before check-in", pct: 100 },
      { label: "Within 24h of check-in", pct: 50 },
      { label: "After check-in", pct: 0 },
    ],
    Medium: [
      { label: "More than 7 days before", pct: 100 },
      { label: "3–7 days before", pct: 50 },
      { label: "Less than 3 days", pct: 0 },
    ],
    Strict: [
      { label: "More than 30 days before", pct: 100 },
      { label: "14–30 days before", pct: 50 },
      { label: "Less than 14 days", pct: 0 },
    ],
  };
  const [refunds, setRefunds] = useState(refundPresets["Medium"]);
  const [advance, setAdvance] = useState(50);
  const [rules, setRules] = useState<Record<string, boolean>>({
    "No smoking inside rooms": true,
    "No loud music after 10 PM": true,
    "Pets allowed": false,
    "Outside food allowed": true,
    "Couples welcome (valid ID required)": true,
    "Children under 5 stay free": true,
    "No firearms or illegal substances": true,
  });
  const [dirty, setDirty] = useState(false);
  const mark = () => setDirty(true);

  const choosePolicy = (p: CancelPolicy) => { setPolicy(p); setRefunds(refundPresets[p]); mark(); };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Policies" subtitle="Check-in times, cancellations, and house rules." />

      <Section title="Check-in / Check-out">
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <Field label="Check-in time"><input type="time" value={checkIn} onChange={(e) => { setCheckIn(e.target.value); mark(); }} className={inputCls} /></Field>
          <Field label="Check-out time"><input type="time" value={checkOut} onChange={(e) => { setCheckOut(e.target.value); mark(); }} className={inputCls} /></Field>
        </div>
      </Section>

      <Section title="Cancellation policy">
        <div className="grid grid-cols-3 gap-2 max-w-md">
          {(["Flexible", "Medium", "Strict"] as CancelPolicy[]).map((p) => (
            <label key={p} className={`text-sm text-center border rounded-md py-2 cursor-pointer ${policy === p ? "border-primary bg-primary-light text-primary font-medium" : "border-border hover:bg-muted"}`}>
              <input type="radio" name="cancel" className="hidden" checked={policy === p} onChange={() => choosePolicy(p)} />
              {p}
            </label>
          ))}
        </div>

        <div className="space-y-2 pt-2">
          {refunds.map((r, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-border rounded-lg p-3">
              <div className="md:col-span-9"><Field label="Timeframe"><input value={r.label} onChange={(e) => { const next = [...refunds]; next[i] = { ...r, label: e.target.value }; setRefunds(next); mark(); }} className={inputCls} /></Field></div>
              <div className="md:col-span-3"><Field label="Refund %"><input type="number" min={0} max={100} value={r.pct} onChange={(e) => { const next = [...refunds]; next[i] = { ...r, pct: +e.target.value }; setRefunds(next); mark(); }} className={inputCls} /></Field></div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="House rules">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(rules).map(([k, v]) => (
            <label key={k} className="flex items-center gap-2 text-sm border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-muted">
              <input type="checkbox" checked={v} onChange={(e) => { setRules({ ...rules, [k]: e.target.checked }); mark(); }} className="h-4 w-4 accent-primary" />
              {k}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Advance payment" description="Required to confirm a booking.">
        <Field label="Advance %" hint="Remainder collected at check-in.">
          <div className="relative max-w-[160px]">
            <input type="number" min={0} max={100} value={advance} onChange={(e) => { setAdvance(+e.target.value); mark(); }} className={`${inputCls} pr-8`} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          </div>
        </Field>
      </Section>

      <SaveBar dirty={dirty} onSave={() => setDirty(false)} />
    </div>
  );
}
