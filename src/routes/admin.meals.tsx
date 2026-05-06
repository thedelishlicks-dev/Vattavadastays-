import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Section, Field, inputCls, SaveBar } from "@/admin/formKit";

export const Route = createFileRoute("/admin/meals")({ component: MealsPage });

type Plan = { key: string; label: string; included: boolean; price: number };

function MealsPage() {
  const [plans, setPlans] = useState<Plan[]>([
    { key: "breakfast", label: "Breakfast", included: true, price: 200 },
    { key: "lunch", label: "Lunch", included: false, price: 250 },
    { key: "dinner", label: "Dinner", included: false, price: 300 },
    { key: "fullboard", label: "Full board", included: false, price: 650 },
  ]);
  const [individualSum, setIndividualSum] = useState(500);
  const [fullBoardPrice, setFullBoardPrice] = useState(450);
  const [dietary, setDietary] = useState<Record<string, boolean>>({
    Vegetarian: true,
    Vegan: true,
    "Jain food": false,
    "Gluten-free": false,
    Halal: true,
    "Kerala traditional": true,
  });
  const [dirty, setDirty] = useState(false);
  const mark = () => setDirty(true);

  const update = (i: number, patch: Partial<Plan>) => {
    setPlans((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
    mark();
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Meals" subtitle="Meal plans, pricing, and dietary options." />

      <Section title="Meal plans" description="Toggle inclusion in room price and set extra cost.">
        <div className="space-y-2">
          {plans.map((p, i) => (
            <div
              key={p.key}
              className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center border border-border rounded-lg p-3"
            >
              <div className="md:col-span-4 font-medium">{p.label}</div>
              <div className="md:col-span-4">
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={p.included}
                    onChange={(e) => update(i, { included: e.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-muted-foreground">
                    {p.included ? "Included in room price" : "Extra charge"}
                  </span>
                </label>
              </div>
              <div className="md:col-span-4">
                <Field label="Price per person/day">
                  <input
                    type="number"
                    value={p.price}
                    onChange={(e) => update(i, { price: +e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Full board discount" description="Encourage bundling all three meals.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sum of individual meals">
            <input
              type="number"
              value={individualSum}
              onChange={(e) => {
                setIndividualSum(+e.target.value);
                mark();
              }}
              className={inputCls}
            />
          </Field>
          <Field
            label="Full board price"
            hint={`Savings: ₹${Math.max(0, individualSum - fullBoardPrice)}/day`}
          >
            <input
              type="number"
              value={fullBoardPrice}
              onChange={(e) => {
                setFullBoardPrice(+e.target.value);
                mark();
              }}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      <Section title="Dietary options" description="Shown to guests at booking.">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Object.entries(dietary).map(([k, v]) => (
            <label
              key={k}
              className="flex items-center gap-2 text-sm border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={v}
                onChange={(e) => {
                  setDietary({ ...dietary, [k]: e.target.checked });
                  mark();
                }}
                className="h-4 w-4 accent-primary"
              />
              {k}
            </label>
          ))}
        </div>
      </Section>

      <SaveBar dirty={dirty} onSave={() => setDirty(false)} />
    </div>
  );
}
