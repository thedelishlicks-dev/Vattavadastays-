import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { PageHeader, Section, Field, inputCls, SaveBar } from "@/admin/formKit";
import cottage from "@/assets/cottage.jpg";
import strawberry from "@/assets/strawberry.jpg";
import bonfire from "@/assets/bonfire.jpg";
import hero from "@/assets/hero-tea.jpg";

export const Route = createFileRoute("/admin/settings")({ component: SettingsPage });

function SettingsPage() {
  const [property, setProperty] = useState({
    name: "Bleaf Mud House",
    description:
      "A 12-room organic farm stay in the Western Ghats of Vattavada, Kerala. Mud architecture, valley views, and home-cooked meals from our garden.",
  });
  const [photos, setPhotos] = useState<string[]>([hero, cottage, strawberry, bonfire]);
  const [owner, setOwner] = useState({
    name: "Deepak",
    phone: "+91 98470 00000",
    whatsapp: "+91 98470 00000",
  });
  const [templates, setTemplates] = useState({
    confirmation:
      "Hi {{guest}}, your booking at Bleaf Mud House is confirmed for {{checkIn}} to {{checkOut}}. Total: ₹{{amount}}. Pay 50% advance to UPI: rajuthomas@okicici. — Deepak",
    reminder:
      "Hi {{guest}}, your stay at Bleaf Mud House begins tomorrow ({{checkIn}}). Check-in from 1 PM. Directions: bit.ly/bleaf-map. See you soon!",
    thanks:
      "Thank you for staying with us at Bleaf Mud House, {{guest}}! We'd love a Google review: bit.ly/bleaf-review. Come back soon. — Deepak",
  });
  const [dirty, setDirty] = useState(false);
  const mark = () => setDirty(true);

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Settings" subtitle="Property details, photos, and messaging." />

      <Section title="Property">
        <Field label="Name"><input value={property.name} onChange={(e) => { setProperty({ ...property, name: e.target.value }); mark(); }} className={inputCls} /></Field>
        <Field label="Description">
          <textarea
            value={property.description}
            onChange={(e) => { setProperty({ ...property, description: e.target.value }); mark(); }}
            rows={4}
            className="w-full rounded-md border border-border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>
      </Section>

      <Section title="Photos" description="Shown in the public gallery.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {photos.map((src, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border group">
              <img src={src} alt={`Property photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                onClick={() => { setPhotos((p) => p.filter((_, idx) => idx !== i)); mark(); }}
                className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/60 text-white inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                aria-label="Remove photo"
              ><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button className="aspect-square rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary inline-flex flex-col items-center justify-center gap-1 text-xs">
            <ImagePlus className="h-6 w-6" />
            Upload
          </button>
        </div>
      </Section>

      <Section title="Owner contact">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Name"><input value={owner.name} onChange={(e) => { setOwner({ ...owner, name: e.target.value }); mark(); }} className={inputCls} /></Field>
          <Field label="Phone"><input value={owner.phone} onChange={(e) => { setOwner({ ...owner, phone: e.target.value }); mark(); }} className={inputCls} /></Field>
          <Field label="WhatsApp"><input value={owner.whatsapp} onChange={(e) => { setOwner({ ...owner, whatsapp: e.target.value }); mark(); }} className={inputCls} /></Field>
        </div>
      </Section>

      <Section title="WhatsApp message templates" description="Use {{guest}}, {{checkIn}}, {{checkOut}}, {{amount}} as placeholders.">
        {(["confirmation", "reminder", "thanks"] as const).map((k) => (
          <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
            <textarea
              value={templates[k]}
              onChange={(e) => { setTemplates({ ...templates, [k]: e.target.value }); mark(); }}
              rows={3}
              className="w-full rounded-md border border-border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
        ))}
      </Section>

      <SaveBar dirty={dirty} onSave={() => setDirty(false)} />
    </div>
  );
}
