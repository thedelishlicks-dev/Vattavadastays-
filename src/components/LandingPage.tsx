/**
 * stayidom.in — Marketing Landing Page v3
 * Story: Run · Earn · Grow · Understand · Learn. Primary CTA: free Property Audit.
 * Claims here must match what is built (HANDOVER §13, §16). No channel sync, no accounting claims.
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { submitLead } from "../lib/leads";

const C = {
  green: "#166534",
  greenLight: "#dcfce7",
  greenMid: "#bbf7d0",
  amber: "#f59e0b",
  bg: "#fafaf9",
  text: "#1c1917",
  muted: "#78716c",
  dark: "#1c1917",
} as const;

const serif: React.CSSProperties = { fontFamily: "'Playfair Display', Georgia, serif" };
const LOGO_URL =
  "https://vzzfqgqxnodlrvnaxpbw.supabase.co/storage/v1/object/public/hero-images/logo-transparent.png";
const WHATSAPP_URL =
  "https://wa.me/?text=Hi%2C%20I%27d%20like%20a%20free%20Stayidom%20Property%20Audit";
const ROOT_DESCRIPTION =
  "Run your Kerala stay business from your phone. Bookings, payments, expenses, pricing and monthly performance for independent villas, homestays and small resorts.";

/* ---------- content ---------- */

const OUTCOMES = [
  {
    key: "run",
    label: "Run",
    title: "Keep bookings, guests and rooms organised",
    desc: "WhatsApp, phone, walk-in, direct and agent bookings in one calendar. Guest details, rooms and balances in one place. ബുക്കിംഗുകൾ എല്ലാം ഒരിടത്ത്.",
    rows: [
      ["Misty Ridge · 15–17 Jun", "Confirmed"],
      ["Spice Garden · 16–18 Jun", "Part paid"],
      ["Misty Ridge · 20–21 Jun", "Walk-in"],
    ],
  },
  {
    key: "earn",
    label: "Earn",
    title: "Know what came in, what is owed, what went out",
    desc: "Revenue, collected so far, outstanding, expenses you enter, and an estimated operating profit. നിങ്ങളുടെ പണം എവിടെ എന്ന് അറിയാം.",
    rows: [
      ["Revenue", "₹1,10,000"],
      ["Collected so far", "₹84,500"],
      ["Outstanding", "₹25,500"],
      ["Expenses entered", "₹31,000"],
    ],
  },
  {
    key: "grow",
    label: "Grow",
    title: "Spot where you may be losing revenue",
    desc: "Simple rules checked against your own bookings: unpaid balances, empty dates, missing prices, missing expenses, unlabelled booking sources.",
    rows: [
      ["Outstanding payment", "2 stays"],
      ["Empty dates, next 30 days", "6 nights"],
      ["Weekend price not set", "1 room"],
    ],
  },
  {
    key: "understand",
    label: "Understand",
    title: "See how your property is performing",
    desc: "Property Score, occupancy, ADR, RevPAR, revenue by source, and a Monthly Business Report that compares with last month.",
    rows: [
      ["Property Score", "72 / 100"],
      ["Occupancy", "58%"],
      ["Revenue by source", "WhatsApp, Agent, Walk-in"],
    ],
  },
  {
    key: "learn",
    label: "Learn",
    title: "Learn what to improve, then do it in the app",
    desc: "Short, practical lessons for property owners. Each one: Learn → Do → Measure. പഠിക്കൂ, ചെയ്യൂ, ഫലം നോക്കൂ.",
    rows: [
      ["Learn", "How to price weekends"],
      ["Do", "Review weekend prices"],
      ["Measure", "Check your Property Score"],
    ],
  },
] as const;

const COMPARE = [
  [
    "What's booked?",
    "Scroll WhatsApp, check the notebook, hope it's current.",
    "One calendar for every room, booking and walk-in you enter.",
  ],
  [
    "Who still owes me?",
    "Add it up from memory and messages.",
    "Outstanding balance on every stay, in one list.",
  ],
  [
    "What did I earn this month?",
    "Spreadsheet, if you had time to update it.",
    "Revenue, collected so far and expenses, side by side.",
  ],
  [
    "Where am I losing money?",
    "Hard to see. You notice at season end.",
    "Flags for unpaid balances, empty dates and missing prices.",
  ],
  [
    "Which source is working?",
    "Not written down.",
    "Revenue by source: WhatsApp, agents, walk-ins, direct.",
  ],
  ["Is it getting better?", "No baseline.", "Monthly report with last-month comparison."],
];

const PLANS = [
  {
    key: "starter",
    label: "Starter",
    rooms: "1–5 rooms",
    setup: "₹5,000",
    monthly: "₹1,000",
    note: "For most villas and homestays",
  },
  {
    key: "growth",
    label: "Growth",
    rooms: "6–10 rooms",
    setup: "₹10,000",
    monthly: "₹1,500",
    note: "Larger stays with more rooms to run",
  },
  {
    key: "pro",
    label: "Pro",
    rooms: "11+ rooms",
    setup: "₹25,000",
    monthly: "₹2,000",
    note: "Resort-style properties",
  },
];

const FAQS = [
  [
    "Will this cause problems with my agents?",
    "No. Agent bookings carry no Stayidom fee, ₹0 always. You record the agent on each booking and see what you owe them. Your agents keep working the way they do today.",
  ],
  [
    "Does Stayidom connect to Airbnb or Booking.com?",
    "No. It does not sync with other sites today. You can label where a booking came from, so your report shows which sources bring revenue.",
  ],
  [
    "Does Stayidom touch my payments?",
    "Never. Guests pay you directly, by UPI, cash or bank transfer. You record what was received, and Stayidom shows collected and outstanding.",
  ],
  [
    "Is this accounting software?",
    "No. It is a business overview. Collected is the running total you have recorded, not a dated cash ledger, and estimated operating profit is revenue minus the expenses you have entered. Keep your accountant for tax.",
  ],
  [
    "What is the free Property Audit?",
    "Our team reviews your property and sends you a Property Score with the top things to improve, on WhatsApp. It is free and there is no obligation. Tell us about your property and we will contact you within 24 hours.",
  ],
  [
    "How long does setup take?",
    "We set it up with you on a call, using your real bookings. No blank forms to fill.",
  ],
  [
    "Is there a contract?",
    "No contract. Pricing is a one-time setup fee plus a monthly fee, shown above. Agent bookings have no commission.",
  ],
  [
    "Can I take my data with me?",
    "Bookings and payment records can be exported as CSV from the app. Ask us during the audit call if you need a specific export.",
  ],
];

/* ---------- small pieces ---------- */

const wrap: React.CSSProperties = { maxWidth: 940, margin: "0 auto" };
const sectionPad: React.CSSProperties = { padding: "4rem 1.25rem" };

function H2({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <h2
      style={{
        ...serif,
        fontSize: "clamp(1.75rem,4vw,2.5rem)",
        fontWeight: 700,
        lineHeight: 1.15,
        color: light ? "#fafaf9" : C.text,
        textAlign: "center",
        marginBottom: "0.75rem",
      }}
    >
      {children}
    </h2>
  );
}

function Sub({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p
      style={{
        textAlign: "center",
        color: light ? "#a8a29e" : C.muted,
        fontSize: "1.0625rem",
        lineHeight: 1.6,
        maxWidth: 640,
        margin: "0 auto 2.5rem",
      }}
    >
      {children}
    </p>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: C.green,
        color: "#fff",
        border: "none",
        borderRadius: 99,
        padding: "0.9375rem 1.75rem",
        fontSize: "1rem",
        fontWeight: 700,
        cursor: "pointer",
        minHeight: 48,
        boxShadow: "0 4px 14px rgba(22,101,52,.3)",
      }}
    >
      {children}
    </button>
  );
}

/* ---------- audit form (modal + inline) ---------- */

function AuditForm({ dark = false, onDone }: { dark?: boolean; onDone?: () => void }) {
  const [form, setForm] = useState({ name: "", phone: "", property: "", rooms: "" });
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("loading");
    try {
      // The leads table has no rooms column yet, so rooms ride along with the property name.
      const property = [form.property.trim(), form.rooms.trim() && `${form.rooms.trim()} rooms`]
        .filter(Boolean)
        .join(" · ");
      await submitLead({
        name: form.name,
        phone: form.phone,
        property_name: property,
        tier: "audit",
      });
      setState("done");
      onDone?.();
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div style={{ textAlign: "center", padding: "1.5rem 0", color: dark ? "#fff" : C.text }}>
        <div style={{ fontSize: "2.25rem" }}>✅</div>
        <p style={{ fontWeight: 700, fontSize: "1.125rem", margin: "0.5rem 0" }}>
          Thank you! നന്ദി.
        </p>
        <p style={{ color: dark ? "#a8a29e" : C.muted, fontSize: "0.9375rem" }}>
          We will message you on WhatsApp within 24 hours.
        </p>
      </div>
    );
  }

  const input: React.CSSProperties = {
    width: "100%",
    padding: "0.875rem 1rem",
    borderRadius: "0.75rem",
    border: dark ? "1px solid rgba(255,255,255,.25)" : "1px solid #d6d3d1",
    background: dark ? "rgba(255,255,255,.08)" : "#fff",
    color: dark ? "#fff" : C.text,
    fontSize: "1rem",
    boxSizing: "border-box",
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <input
        required
        style={input}
        placeholder="Your name · നിങ്ങളുടെ പേര്"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <input
        required
        type="tel"
        inputMode="tel"
        style={input}
        placeholder="WhatsApp number"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />
      <input
        style={input}
        placeholder="Property name (optional)"
        value={form.property}
        onChange={(e) => setForm({ ...form, property: e.target.value })}
      />
      <input
        style={input}
        inputMode="numeric"
        placeholder="Number of rooms (optional)"
        value={form.rooms}
        onChange={(e) => setForm({ ...form, rooms: e.target.value })}
      />
      {state === "error" && (
        <p role="alert" style={{ color: "#f87171", fontSize: "0.875rem" }}>
          We couldn't send your request just now. Please check your connection and try again.
        </p>
      )}
      <button
        type="submit"
        disabled={state === "loading"}
        style={{
          background: C.green,
          color: "#fff",
          border: "none",
          borderRadius: 99,
          minHeight: 48,
          padding: "0.9375rem",
          fontSize: "1rem",
          fontWeight: 700,
          cursor: "pointer",
          opacity: state === "loading" ? 0.7 : 1,
        }}
      >
        {state === "loading" ? "Sending…" : "Get my free Property Audit →"}
      </button>
      <p style={{ fontSize: "0.8125rem", color: dark ? "#a8a29e" : C.muted, textAlign: "center" }}>
        Free · No obligation · We reply on WhatsApp within 24 hours
      </p>
    </form>
  );
}

function AuditModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", esc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "1.25rem",
          padding: "1.75rem",
          width: "100%",
          maxWidth: 420,
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "1rem",
          }}
        >
          <h2 style={{ ...serif, fontSize: "1.5rem", color: C.text, lineHeight: 1.2 }}>
            Free Property Audit
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              fontSize: "1.5rem",
              cursor: "pointer",
              color: C.muted,
            }}
          >
            ×
          </button>
        </div>
        <p
          style={{
            color: C.muted,
            fontSize: "0.9375rem",
            marginBottom: "1.25rem",
            lineHeight: 1.5,
          }}
        >
          Tell us about your property. We send you a Property Score and the top things to improve.
        </p>
        <AuditForm />
      </div>
    </div>,
    document.body,
  );
}

/* ---------- sections ---------- */

function Navbar({ onCta }: { onCta: () => void }) {
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(250,250,249,.95)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid #e7e5e4",
      }}
    >
      <div
        style={{
          ...wrap,
          maxWidth: 1040,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.625rem 1.25rem",
          gap: "1rem",
        }}
      >
        <a
          href="#"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            ...serif,
            fontSize: "1.375rem",
            fontWeight: 700,
          }}
        >
          <img
            src={LOGO_URL}
            alt=""
            width={32}
            height={32}
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
          <span>
            <span style={{ color: C.green }}>stay</span>
            <span style={{ color: C.text }}>idom</span>
            <span style={{ color: C.amber }}>.in</span>
          </span>
        </a>
        <div className="hidden md:flex" style={{ gap: "1.75rem", fontSize: "0.9375rem" }}>
          {[
            ["#how", "How it works"],
            ["#pricing", "Pricing"],
            ["#faq", "FAQ"],
          ].map(([h, l]) => (
            <a key={h} href={h} style={{ color: C.muted, textDecoration: "none" }}>
              {l}
            </a>
          ))}
        </div>
        <button
          onClick={onCta}
          style={{
            background: C.green,
            color: "#fff",
            border: "none",
            borderRadius: 99,
            padding: "0.625rem 1.125rem",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: "pointer",
            minHeight: 44,
          }}
        >
          Free audit
        </button>
      </div>
    </nav>
  );
}

function Hero({ onCta }: { onCta: () => void }) {
  return (
    <section
      style={{
        background: "linear-gradient(180deg,#f0fdf4 0%,#fafaf9 100%)",
        padding: "3.5rem 1.25rem 3rem",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <p
          style={{
            display: "inline-block",
            background: C.greenLight,
            color: C.green,
            borderRadius: 99,
            padding: "0.375rem 1rem",
            fontSize: "0.8125rem",
            fontWeight: 600,
            marginBottom: "1.25rem",
          }}
        >
          🌿 For Kerala villas, homestays &amp; small resorts
        </p>
        <h1
          style={{
            ...serif,
            fontSize: "clamp(2.25rem,7vw,3.75rem)",
            fontWeight: 700,
            lineHeight: 1.1,
            color: C.text,
            marginBottom: "1.25rem",
          }}
        >
          Run your Kerala stay business <em style={{ color: C.green }}>from your phone.</em>
        </h1>
        <p
          style={{
            fontSize: "clamp(1rem,2.6vw,1.1875rem)",
            color: "#44403c",
            lineHeight: 1.65,
            marginBottom: "0.75rem",
          }}
        >
          Know what's booked, what you're owed, what you've earned, and where you may be losing
          money. Built for independent stays.
        </p>
        <p style={{ fontSize: "1rem", color: C.muted, lineHeight: 1.6, marginBottom: "1.75rem" }}>
          നിങ്ങളുടെ ബുക്കിംഗും പണവും ഫോണിൽ തന്നെ — നോട്ട്ബുക്കും WhatsApp-ഉം മതിയാകാതെ വരുമ്പോൾ.
        </p>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center" }}
        >
          <PrimaryButton onClick={onCta}>Get your free Property Audit</PrimaryButton>
          <a
            href="#how"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 48,
              padding: "0 1.25rem",
              color: C.green,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            See how Stayidom works →
          </a>
        </div>
        <p style={{ marginTop: "1.5rem", fontSize: "0.8125rem", color: C.muted, lineHeight: 1.7 }}>
          Built with homestay owners in Vattavada &amp; the Cardamom Hills · Works with your agents
          · UPI, cash &amp; bank friendly · ₹0 fee on agent bookings
        </p>
      </div>
    </section>
  );
}

function KeralaStrip() {
  const items = [
    "WhatsApp enquiries",
    "Phone bookings",
    "Walk-ins",
    "Direct bookings",
    "Agents",
    "Multiple rooms",
    "UPI · cash · bank",
    "Works on weak signal",
  ];
  return (
    <section
      style={{ background: C.dark, ...sectionPad, paddingTop: "3rem", paddingBottom: "3rem" }}
    >
      <div style={wrap}>
        <H2 light>Built for the way Kerala stays actually work</H2>
        <Sub light>
          Bookings arrive on WhatsApp, phone and through agents, and money arrives by UPI or cash.
          Stayidom starts from there. കേരളത്തിലെ സ്റ്റേകൾക്കായി.
        </Sub>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem", justifyContent: "center" }}
        >
          {items.map((t) => (
            <span
              key={t}
              style={{
                background: "rgba(255,255,255,.08)",
                border: "1px solid rgba(255,255,255,.15)",
                color: "#e7e5e4",
                borderRadius: 99,
                padding: "0.5rem 1rem",
                fontSize: "0.9375rem",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Compare() {
  return (
    <section style={{ background: C.bg, ...sectionPad }}>
      <div style={wrap}>
        <H2>WhatsApp + notebook + spreadsheet + memory?</H2>
        <Sub>That works until you need an answer. Here is what changes.</Sub>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {COMPARE.map(([q, before, after]) => (
            <div
              key={q}
              style={{
                background: "#fff",
                border: "1px solid #e7e5e4",
                borderRadius: "1rem",
                padding: "1.125rem 1.25rem",
              }}
            >
              <p style={{ fontWeight: 700, color: C.text, marginBottom: "0.625rem" }}>{q}</p>
              <p
                style={{
                  color: C.muted,
                  fontSize: "0.9375rem",
                  lineHeight: 1.55,
                  marginBottom: "0.375rem",
                }}
              >
                <span style={{ fontWeight: 600 }}>Today: </span>
                {before}
              </p>
              <p style={{ color: C.green, fontSize: "0.9375rem", lineHeight: 1.55 }}>
                <span style={{ fontWeight: 700 }}>With Stayidom: </span>
                {after}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Outcomes() {
  const [active, setActive] = useState(0);
  const o = OUTCOMES[active];
  return (
    <section id="how" style={{ background: "#f0fdf4", ...sectionPad }}>
      <div style={wrap}>
        <H2>One system. Five outcomes.</H2>
        <Sub>Tap through to see what each one gives you. Screens show sample numbers.</Sub>
        <div
          role="tablist"
          style={{
            display: "flex",
            gap: "0.5rem",
            overflowX: "auto",
            paddingBottom: "0.5rem",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {OUTCOMES.map((t, i) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              style={{
                border: `1.5px solid ${i === active ? C.green : C.greenMid}`,
                background: i === active ? C.green : "#fff",
                color: i === active ? "#fff" : C.green,
                borderRadius: 99,
                padding: "0.625rem 1.125rem",
                fontWeight: 700,
                fontSize: "0.9375rem",
                cursor: "pointer",
                minHeight: 44,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div
          className="grid grid-cols-1 md:grid-cols-2"
          style={{ gap: "1.75rem", alignItems: "center", marginTop: "1.5rem" }}
        >
          <div>
            <h3
              style={{
                ...serif,
                fontSize: "1.625rem",
                lineHeight: 1.2,
                color: C.text,
                marginBottom: "0.75rem",
              }}
            >
              {o.title}
            </h3>
            <p style={{ color: "#44403c", lineHeight: 1.7, fontSize: "1.0625rem" }}>{o.desc}</p>
          </div>
          <div
            style={{
              background: "#fff",
              border: "1px solid #e7e5e4",
              borderRadius: "1.25rem",
              padding: "1.25rem",
              boxShadow: "0 8px 24px rgba(0,0,0,.06)",
            }}
          >
            <p
              style={{
                fontSize: "0.75rem",
                color: C.muted,
                marginBottom: "0.75rem",
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              {o.label.toUpperCase()} · SAMPLE
            </p>
            {o.rows.map(([a, b]) => (
              <div
                key={a}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.75rem 0",
                  borderBottom: "1px solid #f5f5f4",
                  fontSize: "1rem",
                }}
              >
                <span style={{ color: C.muted }}>{a}</span>
                <span style={{ fontWeight: 700, color: C.text, textAlign: "right" }}>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReportSpotlight() {
  const stats = [
    ["Revenue", "₹1,10,000"],
    ["Collected so far", "₹84,500"],
    ["Outstanding", "₹25,500"],
    ["Expenses entered", "₹31,000"],
    ["Estimated operating profit", "₹79,000"],
    ["Occupancy", "58%"],
    ["ADR", "₹4,100"],
    ["RevPAR", "₹2,380"],
  ];
  return (
    <section style={{ background: C.bg, ...sectionPad }}>
      <div style={wrap}>
        <H2>A Monthly Business Report for your property</H2>
        <Sub>
          Once a month, see revenue, money still to collect, expenses, occupancy and revenue by
          source, compared with last month, with what to look at next.
        </Sub>
        <div
          style={{
            background: "#fff",
            border: `1.5px solid ${C.greenMid}`,
            borderRadius: "1.25rem",
            padding: "1.25rem",
            maxWidth: 560,
            margin: "0 auto",
          }}
        >
          <p
            style={{
              fontSize: "0.8125rem",
              fontWeight: 700,
              color: C.amber,
              marginBottom: "0.875rem",
            }}
          >
            SAMPLE REPORT · illustrative numbers, not a real property
          </p>
          <div className="grid grid-cols-2" style={{ gap: "0.75rem" }}>
            {stats.map(([l, v]) => (
              <div
                key={l}
                style={{ background: "#f0fdf4", borderRadius: "0.75rem", padding: "0.75rem" }}
              >
                <div style={{ fontSize: "0.8125rem", color: C.muted }}>{l}</div>
                <div style={{ ...serif, fontSize: "1.25rem", fontWeight: 700, color: C.text }}>
                  {v}
                </div>
              </div>
            ))}
          </div>
        </div>
        <p
          style={{
            textAlign: "center",
            color: C.muted,
            fontSize: "0.875rem",
            marginTop: "1rem",
            maxWidth: 560,
            margin: "1rem auto 0",
            lineHeight: 1.6,
          }}
        >
          Profit is an estimate: revenue minus the expenses you have entered. Your Property Score
          and opportunities in the report show today's position.
        </p>
      </div>
    </section>
  );
}

function ScoreBand({ onCta }: { onCta: () => void }) {
  const cats = ["Listing", "Rooms", "Pricing", "Booking readiness", "Operations", "Growth"];
  return (
    <section style={{ background: C.green, ...sectionPad, color: "#fff", textAlign: "center" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <h2
          style={{
            ...serif,
            fontSize: "clamp(1.75rem,4vw,2.5rem)",
            lineHeight: 1.15,
            marginBottom: "0.75rem",
          }}
        >
          See how ready your property is to perform better
        </h2>
        <p style={{ color: "#dcfce7", lineHeight: 1.65, marginBottom: "1.25rem" }}>
          Your free Property Audit gives you a Property Score out of 100, with your top three things
          to improve. നിങ്ങളുടെ പ്രോപ്പർട്ടി എത്ര തയ്യാറാണ്?
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            justifyContent: "center",
            marginBottom: "1.75rem",
          }}
        >
          {cats.map((c) => (
            <span
              key={c}
              style={{
                background: "rgba(255,255,255,.15)",
                borderRadius: 99,
                padding: "0.375rem 0.875rem",
                fontSize: "0.875rem",
              }}
            >
              {c}
            </span>
          ))}
        </div>
        <button
          onClick={onCta}
          style={{
            background: "#fff",
            color: C.green,
            border: "none",
            borderRadius: 99,
            padding: "0.9375rem 1.75rem",
            fontWeight: 700,
            fontSize: "1rem",
            cursor: "pointer",
            minHeight: 48,
          }}
        >
          Get your free Property Audit
        </button>
      </div>
    </section>
  );
}

function WorksWith() {
  const tiles = [
    [
      "🤝",
      "Works with your agents",
      "Record the agent on each booking and see what you owe. ₹0 Stayidom fee on agent bookings.",
    ],
    [
      "💬",
      "WhatsApp-friendly",
      "Send booking confirmations, payment reminders and directions to guests with a tap.",
    ],
    [
      "📲",
      "Optional direct booking page",
      "Share a link on Instagram or Google. Guests pick dates and send a request. Turn it on only if you want it.",
    ],
  ];
  return (
    <section style={{ background: C.bg, ...sectionPad }}>
      <div style={wrap}>
        <H2>Your agents, WhatsApp and direct guests, together</H2>
        <Sub>
          Nothing changes about how you take bookings. You just stop keeping it all in your head.
        </Sub>
        <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: "1rem" }}>
          {tiles.map(([i, t, d]) => (
            <div
              key={t}
              style={{
                background: "#fff",
                border: "1px solid #e7e5e4",
                borderRadius: "1rem",
                padding: "1.25rem",
              }}
            >
              <div style={{ fontSize: "1.75rem" }}>{i}</div>
              <h3 style={{ fontWeight: 700, margin: "0.5rem 0", color: C.text }}>{t}</h3>
              <p style={{ color: C.muted, fontSize: "0.9375rem", lineHeight: 1.6 }}>{d}</p>
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", marginTop: "1.25rem" }}>
          <a
            href="https://demo.stayidom.in"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: C.green, fontWeight: 600, textDecoration: "none" }}
          >
            See a sample guest booking page ↗
          </a>
        </p>
      </div>
    </section>
  );
}

function Trust() {
  const items = [
    [
      "🌿",
      "Early pilot",
      "We are building with homestay owners in Vattavada and the Cardamom Hills. We will show your own bookings on the setup call, not a generic demo.",
    ],
    [
      "💸",
      "We never touch your money",
      "Guests pay you directly. Stayidom only shows what you have recorded.",
    ],
    ["📦", "Your records are yours", "Bookings and payments can be exported to CSV from the app."],
    [
      "🔍",
      "Honest numbers",
      "Collected is the running total you record, and profit is an estimate. We say so in the app.",
    ],
  ];
  return (
    <section style={{ background: "#f0fdf4", ...sectionPad }}>
      <div style={wrap}>
        <H2>Why you can trust it with your numbers</H2>
        <Sub>Plain answers, no big promises.</Sub>
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "1rem" }}>
          {items.map(([i, t, d]) => (
            <div
              key={t}
              style={{
                background: "#fff",
                border: `1px solid ${C.greenMid}`,
                borderRadius: "1rem",
                padding: "1.25rem",
                display: "flex",
                gap: "0.875rem",
              }}
            >
              <span style={{ fontSize: "1.5rem" }}>{i}</span>
              <div>
                <h3 style={{ fontWeight: 700, color: C.text, marginBottom: "0.25rem" }}>{t}</h3>
                <p style={{ color: C.muted, fontSize: "0.9375rem", lineHeight: 1.6 }}>{d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing({ onCta }: { onCta: () => void }) {
  return (
    <section id="pricing" style={{ background: C.bg, ...sectionPad }}>
      <div style={wrap}>
        <H2>Simple, transparent pricing</H2>
        <Sub>
          A one-time setup fee, where we set it up with you, plus a monthly fee. No contract. No
          commission, including on agent bookings.
        </Sub>
        <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: "1rem" }}>
          {PLANS.map((p) => (
            <div
              key={p.key}
              style={{
                background: "#fff",
                border: p.key === "starter" ? `2px solid ${C.green}` : "1px solid #e7e5e4",
                borderRadius: "1.25rem",
                padding: "1.5rem",
              }}
            >
              <p style={{ fontWeight: 700, color: C.green }}>
                {p.label} · {p.rooms}
              </p>
              <p style={{ color: C.muted, fontSize: "0.875rem", margin: "0.25rem 0 1rem" }}>
                {p.note}
              </p>
              <p style={{ ...serif, fontSize: "2rem", fontWeight: 700, color: C.text }}>
                {p.monthly}
                <span style={{ fontSize: "1rem", fontFamily: "inherit", color: C.muted }}>
                  {" "}
                  / month
                </span>
              </p>
              <p style={{ color: C.text, fontWeight: 600, marginTop: "0.5rem" }}>
                + {p.setup} one-time setup
              </p>
            </div>
          ))}
        </div>
        <p
          style={{ textAlign: "center", color: C.muted, fontSize: "0.875rem", margin: "1.25rem 0" }}
        >
          Not sure which fits? Start with the free audit and we will tell you.
        </p>
        <div style={{ textAlign: "center" }}>
          <PrimaryButton onClick={onCta}>Get your free Property Audit</PrimaryButton>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" style={{ background: "#f0fdf4", ...sectionPad }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <H2>Questions owners ask</H2>
        <div
          style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}
        >
          {FAQS.map(([q, a], i) => (
            <div
              key={q}
              style={{
                background: "#fff",
                border: `1px solid ${C.greenMid}`,
                borderRadius: "0.875rem",
              }}
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  padding: "1rem 1.125rem",
                  fontWeight: 600,
                  fontSize: "1rem",
                  color: C.text,
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  minHeight: 48,
                }}
              >
                {q}
                <span aria-hidden>{open === i ? "−" : "+"}</span>
              </button>
              {open === i && (
                <p
                  style={{
                    padding: "0 1.125rem 1.125rem",
                    color: C.muted,
                    lineHeight: 1.7,
                    fontSize: "0.9375rem",
                  }}
                >
                  {a}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section id="audit" style={{ background: C.dark, ...sectionPad }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <H2 light>Get your free Property Audit</H2>
        <Sub light>
          Tell us about your property. We'll send your Property Score and top improvements on
          WhatsApp.
        </Sub>
        <AuditForm dark />
        <p style={{ textAlign: "center", marginTop: "1.25rem" }}>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#4ade80", fontWeight: 600, textDecoration: "none" }}
          >
            Or message us on WhatsApp →
          </a>
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer
      style={{
        background: C.dark,
        color: C.muted,
        borderTop: "1px solid #292524",
        padding: "2.5rem 1.25rem",
      }}
    >
      <div
        style={{
          ...wrap,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          fontSize: "0.9375rem",
        }}
      >
        <span style={{ ...serif, color: "#a8a29e", fontSize: "1.0625rem" }}>
          <span style={{ color: "#4ade80" }}>stay</span>idom
          <span style={{ color: C.amber }}>.in</span>
        </span>
        <span>Built for Kerala stays 🌿 · India</span>
        <span>© {new Date().getFullYear()} stayidom.in · All rights reserved</span>
      </div>
    </footer>
  );
}

/* ---------- page ---------- */

export default function LandingPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const openAudit = useCallback(() => setModalOpen(true), []);

  // Fonts used only on this page load here, not on every property page.
  useEffect(() => {
    const id = "landing-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&family=Noto+Sans+Malayalam:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }, []);

  // Root-domain title and description for this owner-facing page. index.html's defaults are
  // guest-facing, so set ours while the landing page is mounted and restore them after.
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Stayidom — Run your Kerala stay business from your phone";
    const metas = Array.from(
      document.querySelectorAll<HTMLMetaElement>(
        'meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]',
      ),
    );
    const prev = metas.map((m) => m.content);
    metas.forEach((m) => (m.content = ROOT_DESCRIPTION));
    return () => {
      document.title = prevTitle;
      metas.forEach((m, i) => (m.content = prev[i]));
    };
  }, []);

  return (
    <>
      <AuditModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      <Navbar onCta={openAudit} />
      <main
        style={{
          fontFamily: "'Noto Sans Malayalam','Segoe UI',system-ui,sans-serif",
          overflowX: "hidden",
          width: "100%",
          maxWidth: "100vw",
        }}
      >
        <Hero onCta={openAudit} />
        <KeralaStrip />
        <Compare />
        <Outcomes />
        <ReportSpotlight />
        <ScoreBand onCta={openAudit} />
        <WorksWith />
        <Trust />
        <Pricing onCta={openAudit} />
        <FAQ />
        <FinalCta />
        <Footer />
      </main>
    </>
  );
}
