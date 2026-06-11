/**
 * stayidom.in — Marketing Landing Page v2
 * Only changes from original:
 * 1. Navbar: text logo → image logo with text fallback
 * 2. Hero: logo image added above the h1
 * Everything else is identical.
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

const C = {
  green:      "#166534",
  greenLight: "#dcfce7",
  greenMid:   "#bbf7d0",
  amber:      "#f59e0b",
  bg:         "#fafaf9",
  text:       "#1c1917",
  muted:      "#78716c",
  dark:       "#1c1917",
} as const;

const serif: React.CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
};

// stayidom.in OG image used as the brand logo on the landing page
const LOGO_URL = "https://vzzfqgqxnodlrvnaxpbw.supabase.co/storage/v1/object/public/hero-images/og-default.jpeg";

import { submitLead } from "../lib/leads";

const FEATURES = [
  { icon: "🌐", title: "Branded Booking Website",    desc: "yourproperty.stayidom.in — fast, mobile-first, 2G optimized. Instagram bio-ൽ share ചെയ്യൂ." },
  { icon: "💸", title: "Commission-Free Forever",    desc: "Booking.com & MakeMyTrip-ന് 15–25% കൊടുക്കേണ്ട. Flat monthly fee മാത്രം." },
  { icon: "📲", title: "Direct UPI Payments",        desc: "Guest pay ചെയ്‌ത് seconds-ൽ നിങ്ങളുടെ account-ൽ. No middleman. No waiting." },
  { icon: "🔍", title: "Live Booking Tracking",      desc: "Guest-ന് booking status real-time-ൽ കാണാം — confirmed, pending, cancelled." },
  { icon: "🧾", title: "Auto Invoice Generation",    desc: "Professional invoices automatic. Part-payment, advance, balance — tracked." },
  { icon: "📊", title: "Accounts Dashboard",         desc: "Monthly revenue, pending payments, collected — ഒറ്റ screen-ൽ. Tax-ready." },
  { icon: "📥", title: "CSV Export",                 desc: "Bookings & payments Excel-ൽ export. Accountant-ന് share ചെയ്യൂ. No lock-in." },
  { icon: "💬", title: "WhatsApp Deep Links",        desc: "Booking confirm, payment reminder, directions — ഒരു tap-ൽ guest-ന് message ready." },
  { icon: "📡", title: "2G / Rural Optimized",       desc: "No heavy Maps SDK. System fonts. Lightweight SPA. Vattavada-ൽ works perfectly." },
];

const COMPARISON = [
  { feature: "Commission & Fees",        ota: "15–25% per booking. ₹10,000 booking → ₹2,500 gone.",                     stayidom: "₹0 commission. Flat monthly subscription. You keep 100%." },
  { feature: "Payout Speed",             ota: "14–21 days after checkout. Cash flow problems during peak season.",        stayidom: "Instant. UPI hits your account seconds after guest pays." },
  { feature: "Guest Data",               ota: "None. OTAs mask phone & email. You can't remarket or build loyalty.",      stayidom: "100% yours. Full name, phone, email in your dashboard." },
  { feature: "Setup Time",               ota: "Days to weeks. Verification, document uploads, approval queue.",           stayidom: "5 minutes. Property info → live booking page. Done." },
  { feature: "Network & Connectivity",   ota: "Heavy apps. Fails on 2G/Edge. Timeout errors in Vattavada frequently.",   stayidom: "2G optimized. Lightweight SPA built for mountain networks." },
  { feature: "Guest Communication",      ota: "Masked channels only. No direct WhatsApp. No direct calls.",              stayidom: "WhatsApp integrated. Direct deep links to owner's number." },
  { feature: "Financial Tracking",       ota: "No tracking of cash advances, partial payments, or food bills.",          stayidom: "Full accounts. Part-payment, balance, revenue, CSV export." },
  { feature: "Data Portability",         ota: "Locked in. Lose booking history if you leave the platform.",              stayidom: "100% portable. Export everything to CSV anytime. No lock-in." },
];

const TRUST_CARDS = [
  { icon: "🛡️", title: "Direct-to-Owner Verified",      desc: "Guest page-ൽ owner verification badge കാണിക്കും. Property owner directly run ചെയ്യുന്നു — hidden middleman ഇല്ല.",           badges: ["Owner verified", "No middleman"] },
  { icon: "💬", title: "Instant WhatsApp Touchpoint",    desc: "Booking ചെയ്‌ത് seconds-ൽ owner-ന്റെ WhatsApp-ൽ message send ആകും. Real human response — confidence builds instantly.",       badges: ["WhatsApp confirmed", "Instant response"] },
  { icon: "🧾", title: "Professional Invoice & Status",  desc: "Guest-ന് professional booking confirmation. Live booking status phone-ൽ കാണാം. PDF invoice ഉടനെ ready.",                   badges: ["PDF invoice", "Live status"] },
  { icon: "📋", title: "Transparent Policies",           desc: "Cancellation policy, house rules, meal options — checkout page-ൽ clearly display ആകും. Guest-ന് surprise ഇല്ല.",             badges: ["House rules visible", "Cancellation clear"] },
  { icon: "📦", title: "Zero Platform Lock-in",          desc: "Tax season-ൽ entire guest database, booking history, billing ledger — ഒരു click-ൽ CSV export. Data is yours forever.",       badges: ["Full CSV export", "No lock-in"] },
  { icon: "📍", title: "Offline Directions",             desc: "Google Maps deep link — guest offline map download ചെയ്‌താൽ Vattavada-ൽ no signal-ലും directions കിട്ടും.",                   badges: ["Works offline", "2G ready"] },
];

const TESTIMONIALS = [
  { name: "Rajesh M.",      property: "Vattavada Mudhouse · Peak season operator",   saving: "₹18,000 / month saved",   quote: "MMT requested 18% for our peak season weekend bookings. We shifted our Instagram traffic to stayidom.in, kept 100% of the revenue, and collected advances directly via Google Pay before guests even arrived." },
  { name: "Suresh Kumar",   property: "Misty Valley Homestay, Vattavada",            saving: "₹12,000 / month save",    quote: "Booking.com-ൽ നിന്ന് ₹800 commission per booking. ഇപ്പോൾ ആ പണം ഞാൻ save ചെയ്യുന്നു. CSV export ചെയ്‌ത് accountant-ന് കൊടുക്കുന്നു — accounts neat ആണ്." },
  { name: "Thomas Varghese",property: "Cardamom Estate Stay, Munnar",                saving: "100% direct bookings",    quote: "WhatsApp-ൽ link share ചെയ്‌താൽ guests directly book ചെയ്യും. Guest-ന് booking status phone-ൽ കാണാം. 2G-ൽ ഒക്കെ smooth ആണ്." },
];

const FAQS = [
  { q: "📡 Range കുറഞ്ഞിരിക്കുമ്പോഴും booking കിട്ടുമോ?",                     a: "Yes — guests city-ൽ ഇരുന്ന് book ചെയ്യും (good network). Guest page ഒരിക്കൽ load ആയാൽ PWA cache ചെയ്യും. Owner dashboard 2G-ൽ work ചെയ്യാൻ TanStack Query optimistic updates ഉപയോഗിക്കുന്നു — actions instant ആണ്, sync background-ൽ ആകും." },
  { q: "💸 stayidom-ന് എന്റെ payment-ൽ access ഉണ്ടോ?",                         a: "ഇല്ല. stayidom.in ഒരിക്കലും നിങ്ങളുടെ payment touch ചെയ്യില്ല. Guest നേരിട്ട് നിങ്ങളുടെ UPI ID-ലേക്ക് pay ചെയ്യും. V1-ൽ no payment gateway — direct P2P payment." },
  { q: "👥 Guests stayidom-ൽ trust ചെയ്യുമോ? Booking.com ഇല്ലാതെ book ചെയ്യുമോ?", a: "Yes. Property page-ൽ owner verification, WhatsApp instant contact, transparent policies, professional invoice — ഇതെല്ലാം guest trust build ചെയ്യും. Instagram-ൽ നിന്ന് direct booking convert rate ഉയർന്നതാണ്." },
  { q: "📦 Platform ഒഴിഞ്ഞ് പോകണം എന്ന് തോന്നിയാൽ data കിട്ടുമോ?",            a: "100%. Booking history, guest database, billing ledger — ഒരു click-ൽ CSV export. No restrictions, no lock-in, no extraction fee. Data always yours." },
  { q: "⏱️ Setup-ന് എത്ര time കൊടുക്കണം?",                                     a: "Property details fill ചെയ്‌ത് 5 minutes. stayidom team setup help ചെയ്യും. Domain live ആകും, WhatsApp link ready ആകും. ഇന്ന് register ചെയ്‌താൽ ഇന്ന് booking page live." },
  { q: "📄 Contract ഉണ്ടോ? Lock-in period ഉണ്ടോ?",                              a: "ഇല്ല. Monthly subscription. Cancel anytime. Hidden fees ഇല്ല. Commission ഇല്ല. 14 days free trial-ൽ start ചെയ്യൂ." },
];

function SectionHeader({ title, sub, light = false }: { title: string; sub?: string; light?: boolean }) {
  return (
    <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
      <h2 style={{ ...serif, fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 700, color: light ? "#fafaf9" : C.text, marginBottom: "0.625rem", lineHeight: 1.15 }}>
        {title}
      </h2>
      {sub && <p style={{ color: light ? "#a8a29e" : C.muted, fontSize: "1.0625rem" }}>{sub}</p>}
    </div>
  );
}

function CardCarousel({ children, itemCount }: { children: React.ReactNode; itemCount: number }) {
  const [current, setCurrent] = useState(0);
  const prev = useCallback(() => setCurrent(i => Math.max(0, i - 1)), []);
  const next = useCallback(() => setCurrent(i => Math.min(itemCount - 1, i + 1)), [itemCount]);
  return (
    <>
      <div className="md:hidden" style={{ position: "relative" }}>
        <div style={{ display: "flex", overflowX: "hidden", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
          <div style={{ display: "flex", width: "100%", transition: "transform 0.35s cubic-bezier(.4,0,.2,1)", transform: `translateX(calc(-${current} * (100% + 12px)))`, gap: 12 }}>
            {children}
          </div>
        </div>
        {current > 0 && (
          <button onClick={prev} aria-label="Previous" style={{ position: "absolute", left: -4, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: "50%", border: `1.5px solid ${C.greenMid}`, background: "#fff", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,.08)", zIndex: 2 }}>‹</button>
        )}
        {current < itemCount - 1 && (
          <button onClick={next} aria-label="Next" style={{ position: "absolute", right: -4, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: "50%", border: `1.5px solid ${C.greenMid}`, background: "#fff", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,.08)", zIndex: 2 }}>›</button>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: "1.25rem" }}>
          {Array.from({ length: itemCount }).map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)} aria-label={`Go to slide ${i + 1}`} style={{ width: i === current ? 20 : 8, height: 8, borderRadius: 99, border: "none", cursor: "pointer", padding: 0, background: i === current ? C.green : C.greenMid, transition: "all 0.25s" }} />
          ))}
        </div>
      </div>
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-5">{children}</div>
    </>
  );
}

function Slide({ children }: { children: React.ReactNode }) {
  return <div style={{ minWidth: "100%", width: "100%" }}>{children}</div>;
}

function DemoModal({ isOpen, onClose, preselectedTier }: { isOpen: boolean; onClose: () => void; preselectedTier: string }) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [form, setForm]           = useState({ name: "", phone: "", property: "", tier: preselectedTier });

  useEffect(() => {
    if (preselectedTier) setForm(f => ({ ...f, tier: preselectedTier }));
  }, [preselectedTier]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { await submitLead({ name: form.name, phone: form.phone, property_name: form.property, tier: form.tier }); } catch {}
    finally { setLoading(false); setSubmitted(true); }
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => { setSubmitted(false); setForm({ name: "", phone: "", property: "", tier: "" }); }, 300);
  };

  if (!isOpen) return null;

  const inputStyle: React.CSSProperties = { width: "100%", padding: "0.9375rem 1.125rem", borderRadius: "0.875rem", border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.14)", color: "#fff", fontSize: "1rem", outline: "none", fontFamily: "inherit", boxSizing: "border-box" };

  return (
    <div onClick={handleClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.25rem", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: "linear-gradient(155deg,#166534,#14532d)", borderRadius: "1.5rem", padding: "2rem", boxShadow: "0 32px 80px rgba(0,0,0,.45)", position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
        <button onClick={handleClose} aria-label="Close" style={{ position: "absolute", top: "1rem", right: "1rem", width: 32, height: 32, borderRadius: "50%", border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.1)", color: "#fff", fontSize: "1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>✕</button>
        <h2 style={{ ...serif, fontSize: "clamp(1.5rem,4vw,2rem)", fontWeight: 700, color: "#fff", marginBottom: "0.5rem", paddingRight: "2rem" }}>ഇന്ന് Free Demo ബുക്ക് ചെയ്യൂ</h2>
        <p style={{ color: C.greenLight, fontSize: "0.9375rem", marginBottom: "1.75rem" }}>24 hours-ൽ ഞങ്ങൾ WhatsApp-ൽ contact ചെയ്യും. Zero obligation.</p>
        {submitted ? (
          <div style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)", borderRadius: "1.25rem", padding: "2rem", color: "#fff", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "0.875rem" }}>🌿</div>
            <p style={{ fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.5rem" }}>നന്ദി!</p>
            <p style={{ color: C.greenLight, fontSize: "1rem", marginBottom: "1.5rem" }}>ഞങ്ങൾ 24 hours-ൽ WhatsApp-ൽ reach ചെയ്യും.</p>
            <button onClick={handleClose} style={{ background: C.amber, color: C.dark, border: "none", padding: "0.75rem 2rem", borderRadius: 99, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: "0.9375rem" }}>Continue exploring →</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <input type="text" placeholder="നിങ്ങളുടെ പേര്"         required style={inputStyle} value={form.name}     onChange={e => setForm(f=>({...f,name:e.target.value}))} />
            <input type="tel"  placeholder="WhatsApp Number"          required style={inputStyle} value={form.phone}    onChange={e => setForm(f=>({...f,phone:e.target.value}))} />
            <input type="text" placeholder="Homestay name (optional)"         style={inputStyle} value={form.property} onChange={e => setForm(f=>({...f,property:e.target.value}))} />
            <select value={form.tier} onChange={e => setForm(f=>({...f,tier:e.target.value}))} style={{ ...inputStyle, appearance: "none", WebkitAppearance: "none" }}>
              <option value="">Plan select ചെയ്യൂ (optional)</option>
              <option value="starter">Starter — 1–5 rooms · ₹5,000 setup</option>
              <option value="growth">Growth — 6–10 rooms · ₹10,000 setup</option>
              <option value="pro">Pro — 10+ rooms · ₹25,000 setup</option>
            </select>
            <button type="submit" disabled={loading} style={{ background: C.amber, color: C.dark, border: "none", padding: "1.0625rem", borderRadius: 99, fontSize: "1.0625rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1, marginTop: "0.5rem" }}>
              {loading ? "Submitting..." : "Free Demo ബുക്ക് ചെയ്യൂ →"}
            </button>
          </form>
        )}
        <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "rgba(255,255,255,.5)", marginTop: "1.25rem" }}>🔒 No spam · No commitment · Cancel anytime</p>
      </div>
    </div>
  );
}

function HeroBg() {
  return (
    <svg aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.07, pointerEvents: "none" }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice">
      <g stroke={C.green} fill="none" strokeWidth="1.2">
        <ellipse cx="600" cy="300" rx="560" ry="270" /><ellipse cx="600" cy="300" rx="460" ry="220" />
        <ellipse cx="600" cy="300" rx="360" ry="170" /><ellipse cx="600" cy="300" rx="260" ry="120" />
        <ellipse cx="200" cy="150" rx="280" ry="180" /><ellipse cx="200" cy="150" rx="180" ry="115" />
        <ellipse cx="1020" cy="480" rx="260" ry="165" /><ellipse cx="1020" cy="480" rx="160" ry="105" />
      </g>
    </svg>
  );
}

// ── NAVBAR — logo image replaces text mark ────────────────────────────────────
function Navbar({ onDemoClick }: { onDemoClick: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <nav style={{ background: C.bg, borderBottom: "1px solid #e7e5e4", position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "0 1.25rem", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Logo only — no text */}
        <a href="#" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img
            src={LOGO_URL}
            alt="stayidom.in"
            style={{ height: 52, width: "auto", objectFit: "contain", borderRadius: "0.5rem" }}
            onError={e => {
              // Fallback to text if image fails
              const el = e.currentTarget as HTMLImageElement;
              el.style.display = "none";
              const span = document.createElement("span");
              span.innerHTML = `<span style="color:${C.green}">stay</span><span style="color:${C.text}">idom</span><span style="color:${C.amber}">.in</span>`;
              span.style.fontFamily = "'Playfair Display', Georgia, serif";
              span.style.fontSize = "1.25rem";
              span.style.fontWeight = "700";
              el.parentElement?.appendChild(span);
            }}
          />
        </a>
        <div className="hidden md:flex" style={{ gap: "1.5rem", alignItems: "center", fontSize: "0.9375rem", color: C.muted }}>
          {[["#features","Features"],["#compare","Compare"],["#pricing","Pricing"],["#faq","FAQ"]].map(([h,l]) => (
            <a key={h} href={h} style={{ color: C.muted }} onMouseEnter={e => (e.currentTarget.style.color=C.text)} onMouseLeave={e => (e.currentTarget.style.color=C.muted)}>{l}</a>
          ))}
          <button onClick={onDemoClick} style={{ background: C.green, color: "#fff", padding: "0.5rem 1.25rem", borderRadius: 99, fontWeight: 700, fontSize: "0.9375rem", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Free Demo</button>
        </div>
        <button className="md:hidden" onClick={() => setOpen(v=>!v)} aria-label="Toggle menu" style={{ background: "none", border: "none", cursor: "pointer", padding: "0.5rem", display: "flex", flexDirection: "column", justifyContent: "center", gap: 5, flexShrink: 0 }}>
          <span style={{ display:"block", width:22, height:2, background:C.text, borderRadius:2, transition:"all .25s", transform: open ? "rotate(45deg) translateY(7px)" : "none" }} />
          <span style={{ display:"block", width:22, height:2, background:C.text, borderRadius:2, transition:"all .25s", opacity: open ? 0 : 1 }} />
          <span style={{ display:"block", width:22, height:2, background:C.text, borderRadius:2, transition:"all .25s", transform: open ? "rotate(-45deg) translateY(-7px)" : "none" }} />
        </button>
      </div>
      {open && (
        <div style={{ background: C.bg, borderTop: "1px solid #e7e5e4", padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {[["#features","Features"],["#compare","Compare"],["#pricing","Pricing"],["#faq","FAQ"]].map(([h,l]) => (
            <a key={h} href={h} onClick={()=>setOpen(false)} style={{ color: C.muted, fontSize: "1rem" }}>{l}</a>
          ))}
          <button onClick={() => { setOpen(false); onDemoClick(); }} style={{ background: C.green, color: "#fff", padding: "0.75rem 1.25rem", borderRadius: 99, fontWeight: 700, textAlign: "center", fontSize: "1rem", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Free Demo</button>
        </div>
      )}
    </nav>
  );
}

// ── HERO — logo image above the headline ──────────────────────────────────────
function Hero({ onDemoClick }: { onDemoClick: () => void }) {
  return (
    <section style={{ background: "linear-gradient(155deg,#f0fdf4 0%,#fafaf9 55%,#fef3c7 100%)", padding: "5.5rem 1.25rem 4.5rem", textAlign: "center", position: "relative", overflow: "hidden" }}>
      <HeroBg />
      <div style={{ position: "relative", maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.375rem 1rem", borderRadius: 99, fontSize: "0.875rem", fontWeight: 500, background: C.greenLight, color: C.green, border: `1px solid ${C.greenMid}`, marginBottom: "2rem" }}>
          🌿 Vattavada &amp; Munnar Homestay Owners-ന്
        </div>

        {/* FIX: logo image in hero */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
          <img
            src={LOGO_URL}
            alt="stayidom.in"
            style={{ height: 80, width: "auto", objectFit: "contain", borderRadius: "0.75rem", boxShadow: "0 4px 24px rgba(22,101,52,.15)" }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </div>

        <h1 style={{ ...serif, fontSize: "clamp(2.75rem,7vw,5rem)", fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.03em", color: C.text, marginBottom: "1.5rem" }}>
          നിങ്ങളുടെ Homestay.{" "}
          <em style={{ color: C.green, fontStyle: "italic", display: "block" }}>നിങ്ങളുടെ Platform.</em>
        </h1>
        <p style={{ fontSize: "1.125rem", color: C.muted, maxWidth: 600, margin: "0 auto 2.5rem", lineHeight: 1.8 }}>
          Branded booking website · Direct UPI payments · Guest invoicing · WhatsApp integration · Accounts tracking — എല്ലാം ഒരിടത്ത്. Booking.com &amp; MakeMyTrip-ന് കൊടുക്കുന്ന 15–25% commission ഇനി നിങ്ങളുടെ business-ലേക്ക്.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap", marginBottom: "3.5rem" }}>
          <button onClick={onDemoClick} style={{ background: C.green, color: "#fff", padding: "0.9375rem 2rem", borderRadius: 99, fontWeight: 700, fontSize: "1rem", boxShadow: "0 4px 24px rgba(22,101,52,.3)", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Free Demo — ഇന്ന് തന്നെ</button>
          <a href="https://demo.stayidom.in" target="_blank" rel="noopener noreferrer" style={{ color: C.green, border: `1.5px solid ${C.green}`, padding: "0.9375rem 2rem", borderRadius: 99, fontWeight: 600, fontSize: "1rem" }}>View Sample Site ↗</a>
        </div>
        <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", flexWrap: "wrap", rowGap: "1rem" }}>
          {[["50+","Homestays live"],["₹0","Commission"],["Instant","UPI Payouts"],["2G","Ready"],["5 min","Setup"]].map(([n,l]) => (
            <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>
              <span style={{ ...serif, fontSize: "2rem", fontWeight: 700, color: C.green }}>{n}</span>
              <span style={{ fontSize: "0.9375rem", color: C.muted }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  return (
    <div style={{ background: C.green, padding: "1.125rem 1.25rem", textAlign: "center" }}>
      <p style={{ color: C.greenLight, fontSize: "0.9375rem", letterSpacing: "0.02em" }}>
        Trusted by <strong style={{ color: "#fff" }}>50+ properties</strong> across Vattavada, Munnar &amp; the Cardamom Hills &nbsp;·&nbsp; Recommended by <strong style={{ color: "#fff" }}>Vattavada Tourism Collective</strong>
      </p>
    </div>
  );
}

function ProblemStrip() {
  return (
    <section style={{ background: C.dark, padding: "4.5rem 1.25rem", textAlign: "center" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <p style={{ ...serif, fontSize: "clamp(1.5rem,4vw,2.125rem)", fontWeight: 700, color: "#fafaf9", marginBottom: "1.125rem", lineHeight: 1.3 }}>
          ₹10,000 booking-ൽ ₹2,500 Booking.com-ന്. 15 ദിവസം കഴിഞ്ഞ് payout.
        </p>
        <p style={{ color: "#a8a29e", fontSize: "1.0625rem", lineHeight: 1.8, marginBottom: "1.75rem" }}>
          Booking.com &amp; MakeMyTrip ഓരോ booking-ൽ 15–25% commission എടുക്കുന്നു. പണം 15 ദിവസം കഴിഞ്ഞ് transfer ആകും. Guest-ന്റെ phone number നിങ്ങൾക്ക് കിട്ടില്ല.
        </p>
        <span style={{ background: C.amber, color: C.dark, fontSize: "0.9375rem", fontWeight: 700, padding: "0.5rem 1.375rem", borderRadius: 99, display: "inline-block" }}>
          stayidom.in — ഈ cycle ഇന്ന് break ചെയ്യാം
        </span>
      </div>
    </section>
  );
}

function PhoneMockup() {
  return (
    <section style={{ background: "#f0fdf4", padding: "5rem 1.25rem" }}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center" style={{ maxWidth: 940, margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 280, background: "#0f0f0f", borderRadius: "3rem", padding: "10px", boxShadow: "0 32px 80px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.06)" }}>
            <div style={{ background: "#fff", borderRadius: "2.5rem", overflow: "hidden" }}>
              <div style={{ background: "#0f0f0f", padding: "12px 20px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
                <span style={{ color: "#fff", fontSize: "0.6875rem", fontWeight: 600 }}>9:41</span>
                <div style={{ width: 90, height: 24, background: "#0f0f0f", borderRadius: 99, position: "absolute", left: "50%", transform: "translateX(-50%)" }} />
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontSize: "0.5rem", color: "#fff" }}>●●●</span>
                  <span style={{ fontSize: "0.5625rem", color: "#fff" }}>📶</span>
                  <span style={{ fontSize: "0.5625rem", color: "#fff" }}>🔋</span>
                </div>
              </div>
              <div style={{ padding: "0.875rem 1rem 1rem" }}>
                <div style={{ background: "linear-gradient(160deg,#166534,#14532d)", height: 140, borderRadius: "1rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.greenLight, marginBottom: "0.875rem", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, opacity: 0.15, background: "radial-gradient(circle at 30% 70%,#4ade80,transparent)" }} />
                  <span style={{ fontSize: "1.75rem", marginBottom: "0.375rem" }}>🌿</span>
                  <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.04em" }}>📍 Mist Valley Homestay · Vattavada</span>
                </div>
                <p style={{ fontWeight: 700, fontSize: "0.9375rem", color: C.text, marginBottom: "0.2rem" }}>Mist Valley Homestay</p>
                <p style={{ fontSize: "0.6875rem", color: C.muted, marginBottom: "0.75rem" }}>Vattavada, Munnar · ★ 4.9 · Open for bookings</p>
                <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.75rem" }}>
                  {[["Check-in","June 15"],["Check-out","June 17"]].map(([label,val]) => (
                    <div key={label} style={{ flex: 1, background: "#f5f5f4", borderRadius: "0.5rem", padding: "0.4rem 0.5rem", fontSize: "0.5625rem", color: C.text, border: "1px solid #e7e5e4" }}>
                      <div style={{ color: C.muted, fontSize: "0.5rem", marginBottom: 1 }}>{label}</div>
                      <div style={{ fontWeight: 700 }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.875rem" }}>
                  {[["Misty Ridge Room","₹3,500/night"],["Spice Garden Suite","₹5,500/night"]].map(([name,price]) => (
                    <div key={name} style={{ flex: 1, background: C.greenLight, borderRadius: "0.625rem", padding: "0.5rem 0.375rem", fontSize: "0.5625rem", fontWeight: 600, color: C.green, textAlign: "center", border: `1px solid ${C.greenMid}` }}>
                      {name}<br /><span style={{ fontWeight: 700, fontSize: "0.625rem" }}>{price}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: C.green, color: "#fff", borderRadius: 99, padding: "0.5625rem 0.5rem", fontSize: "0.6875rem", fontWeight: 700, textAlign: "center", marginBottom: "0.4rem", boxShadow: "0 2px 8px rgba(22,101,52,.3)" }}>Book Now — Pick Dates</div>
                <div style={{ background: "#25D366", color: "#fff", borderRadius: 99, padding: "0.5625rem 0.5rem", fontSize: "0.6875rem", fontWeight: 700, textAlign: "center" }}>💬 Book via WhatsApp</div>
              </div>
              <div style={{ padding: "0.5rem 0 0.875rem", display: "flex", justifyContent: "center" }}>
                <div style={{ width: 100, height: 4, background: "#1c1917", borderRadius: 99, opacity: 0.2 }} />
              </div>
            </div>
          </div>
          <p style={{ textAlign: "center", fontSize: "0.8125rem", color: C.muted, marginTop: "1.125rem" }}>demo.stayidom.in</p>
        </div>
        <div>
          <h2 style={{ ...serif, fontSize: "clamp(1.5rem,3vw,2.25rem)", fontWeight: 700, color: C.text, marginBottom: "1rem", lineHeight: 1.3 }}>Guests-ന് ഒരു professional booking page</h2>
          <p style={{ fontSize: "1.0625rem", color: C.muted, lineHeight: 1.8, marginBottom: "1rem" }}>Instagram bio-ൽ ഒരു link share ചെയ്‌താൽ മതി. Guests directly dates pick ചെയ്ത് book ചെയ്യും — Booking.com-ന്റേതു പോലെ clean, fast, mobile-first.</p>
          <p style={{ fontSize: "1.0625rem", color: C.muted, lineHeight: 1.8, marginBottom: "1.5rem" }}>ഓരോ property-ക്കും unique subdomain. Guests-ന് confused ആകില്ല. നിങ്ങളുടെ brand, നിങ്ങളുടെ identity.</p>
          <a href="https://demo.stayidom.in" target="_blank" rel="noopener noreferrer" style={{ color: C.green, fontWeight: 600, fontSize: "0.9375rem", textDecoration: "underline" }}>Live sample കാണൂ →</a>
        </div>
      </div>
    </section>
  );
}

function WhatsAppFlow() {
  const steps = [
    { icon: "🔍", bg: "#f0fdf4", border: C.greenMid, title: "Guest discovers",     desc: "Instagram / WhatsApp forward / Google search → property page" },
    { icon: "💬", bg: "#f0fdf4", border: "#25D366",  title: "One tap to book",     desc: '"Book via WhatsApp" button → pre-filled message opens instantly' },
    { icon: "📲", bg: "#f0fdf4", border: C.amber,    title: "Owner gets notified", desc: "WhatsApp message arrives: Room, Dates, Guest name & Phone" },
    { icon: "✅", bg: C.greenLight, border: C.green, title: "Confirm & collect",   desc: "Owner confirms, sends UPI link. Payment direct to your account." },
  ];
  return (
    <section style={{ background: C.bg, padding: "5rem 1.25rem" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        <SectionHeader title="WhatsApp — Guest-ൽ നിന്ന് നിങ്ങളിലേക്ക് നേരിട്ട്" sub="ഒരു button tap — Guest-ന്റെ WhatsApp-ൽ pre-filled message ready. No app download, no registration." />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6" style={{ position: "relative" }}>
          <div className="hidden md:block" style={{ position: "absolute", top: 28, left: "12%", right: "12%", height: 2, background: `linear-gradient(90deg,#25D366,${C.green})`, zIndex: 0 }} />
          {steps.map(({ icon, bg, border, title, desc }) => (
            <div key={title} style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: bg, border: `2px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 0.875rem", fontSize: "1.375rem" }}>{icon}</div>
              <h4 style={{ fontSize: "0.9375rem", fontWeight: 700, color: C.text, marginBottom: "0.375rem" }}>{title}</h4>
              <p style={{ fontSize: "0.875rem", color: C.muted, lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "1.75rem", background: C.greenLight, border: `1px solid ${C.greenMid}`, borderRadius: "1rem", padding: "1.125rem 1.5rem" }}>
          <p style={{ fontSize: "0.9375rem", color: "#14532d", fontWeight: 600, marginBottom: "0.375rem" }}>💬 Sample pre-filled message guests send:</p>
          <p style={{ fontSize: "0.9375rem", color: C.green, fontStyle: "italic", lineHeight: 1.7 }}>"Hi, I'd like to book the Misty Ridge Room at Mist Valley Homestay. Check-in: June 15. Check-out: June 17. Guests: 2. My name: Anoop Kumar. Phone: 98765XXXXX"</p>
        </div>
      </div>
    </section>
  );
}

function DirectPayment() {
  const methods = [
    { icon: "📲", label: "UPI / Google Pay / PhonePe", desc: "Instant. Guest scans your QR or sends to your UPI ID." },
    { icon: "🏦", label: "Bank Transfer (NEFT/IMPS)",  desc: "Your account details shared. Money arrives same day." },
    { icon: "💵", label: "Cash on Arrival",             desc: "Dashboard records it. Advance + balance tracked automatically." },
  ];
  return (
    <section style={{ background: C.dark, padding: "5rem 1.25rem" }}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center" style={{ maxWidth: 940, margin: "0 auto" }}>
        <div>
          <h2 style={{ ...serif, fontSize: "clamp(1.75rem,3.5vw,2.5rem)", fontWeight: 700, color: "#fff", marginBottom: "1rem", lineHeight: 1.2 }}>പണം നേരിട്ട് നിങ്ങളുടെ അക്കൗണ്ടിലേക്ക്</h2>
          <p style={{ color: "#a8a29e", fontSize: "1.0625rem", lineHeight: 1.8, marginBottom: "1.5rem" }}>stayidom.in ഒരിക്കലും നിങ്ങളുടെ payment touch ചെയ്യില്ല. Guest pay ചെയ്‌ത് 0 seconds-ൽ നിങ്ങളുടെ UPI-ൽ കിട്ടും. 15 ദിവസം wait ചെയ്യേണ്ടതില്ല.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", marginBottom: "1.25rem" }}>
            {methods.map(({ icon, label, desc }) => (
              <div key={label} style={{ background: "#292524", border: "1px solid #44403c", borderRadius: "0.875rem", padding: "0.875rem 1.125rem", display: "flex", alignItems: "center", gap: "0.875rem" }}>
                <div style={{ width: 38, height: 38, borderRadius: "0.5rem", background: C.greenLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.125rem", flexShrink: 0 }}>{icon}</div>
                <div>
                  <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#fff" }}>{label}</div>
                  <div style={{ fontSize: "0.8125rem", color: "#a8a29e" }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: "#2d2208", border: `1px solid ${C.amber}`, borderRadius: "1rem", padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "0.875rem" }}>
            <span style={{ fontSize: "1.375rem", flexShrink: 0 }}>⏱️</span>
            <p style={{ fontSize: "0.9375rem", color: "#fef3c7", lineHeight: 1.6 }}>
              Booking.com average payout: <strong style={{ color: C.amber }}>14–21 days after checkout.</strong> stayidom.in: <strong style={{ color: C.amber }}>Instant. No middleman.</strong>
            </p>
          </div>
        </div>
        <div style={{ background: "#292524", border: "1px solid #44403c", borderRadius: "1.25rem", padding: "1.75rem" }}>
          <p style={{ fontSize: "0.75rem", color: "#a8a29e", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1.125rem" }}>Today's Settlements</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {[
              { name: "Ravi Nair · Misty Ridge Room", sub: "UPI · 2 minutes ago",       amount: "₹7,000", amountColor: "#4ade80", bg: "#1c2e22", border: C.green },
              { name: "Priya S · Spice Garden Suite", sub: "Advance · Cash",            amount: "₹5,500", amountColor: "#4ade80", bg: "#1c2e22", border: C.green },
              { name: "Anoop K · Misty Ridge Room",   sub: "Balance pending · June 20", amount: "₹3,500", amountColor: C.amber,   bg: "#2d2208", border: C.amber },
            ].map(({ name, sub, amount, amountColor, bg, border }) => (
              <div key={name} style={{ background: bg, border: `1px solid ${border}`, borderRadius: "0.75rem", padding: "0.875rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "0.875rem", color: "#86efac", fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: "0.75rem", color: "#4ade80" }}>{sub}</div>
                </div>
                <div style={{ ...serif, fontSize: "1.25rem", fontWeight: 700, color: amountColor }}>{amount}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "1.125rem", paddingTop: "1rem", borderTop: "1px solid #44403c", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.875rem", color: "#a8a29e" }}>Today collected</span>
            <span style={{ ...serif, fontSize: "1.375rem", fontWeight: 700, color: "#4ade80" }}>₹12,500</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ComparisonTable() {
  return (
    <section id="compare" style={{ background: C.bg, padding: "5rem 1.25rem" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        <SectionHeader title="stayidom.in vs Booking.com & MakeMyTrip" sub="ഓരോ row-ഉം compare ചെയ്ത് decide ചെയ്യൂ" />
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: "0.75rem" }}>
          <table style={{ width: "100%", minWidth: 560, borderCollapse: "separate", borderSpacing: 0, fontSize: "0.9375rem" }}>
            <thead>
              <tr>
                <th style={{ padding: "1rem 1.125rem", textAlign: "left", fontWeight: 700, fontSize: "0.875rem", borderBottom: "2px solid #e7e5e4", width: "26%" }}>Feature</th>
                <th style={{ padding: "1rem 1.125rem", textAlign: "left", fontWeight: 700, fontSize: "0.875rem", borderBottom: "2px solid #e7e5e4", background: "#fff1f2", color: "#991b1b", width: "37%" }}>🚫 Booking.com / MakeMyTrip</th>
                <th style={{ padding: "1rem 1.125rem", textAlign: "left", fontWeight: 700, fontSize: "0.875rem", borderBottom: "2px solid #e7e5e4", background: C.greenLight, color: C.green, width: "37%" }}>✅ stayidom.in</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map(({ feature, ota, stayidom }, i) => (
                <tr key={feature}>
                  <td style={{ padding: "0.875rem 1.125rem", fontWeight: 600, color: C.text, borderBottom: i < COMPARISON.length-1 ? "1px solid #f5f5f4" : "none", verticalAlign: "top" }}>{feature}</td>
                  <td style={{ padding: "0.875rem 1.125rem", background: "#fff8f8", color: "#7f1d1d", borderBottom: i < COMPARISON.length-1 ? "1px solid #f5f5f4" : "none", lineHeight: 1.6, verticalAlign: "top" }}>{ota}</td>
                  <td style={{ padding: "0.875rem 1.125rem", background: "#f0fdf8", color: "#14532d", borderBottom: i < COMPARISON.length-1 ? "1px solid #f5f5f4" : "none", lineHeight: 1.6, verticalAlign: "top", fontWeight: 500 }}>{stayidom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function GuestTrustSignals() {
  return (
    <section style={{ background: "#f0fdf4", padding: "5rem 1.25rem" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        <SectionHeader title="Guests-ന് trust ചെയ്യാൻ കാരണം" sub="Booking.com ഇല്ലാതെ guest book ചെയ്യുമോ? — ഈ trust signals ഉണ്ടെങ്കിൽ, yes." />
        <CardCarousel itemCount={TRUST_CARDS.length}>
          {TRUST_CARDS.map(({ icon, title, desc, badges }) => (
            <Slide key={title}>
              <div style={{ background: "#fff", border: `1px solid ${C.greenMid}`, borderRadius: "1.25rem", padding: "1.75rem", height: "100%", boxSizing: "border-box" }}>
                <div style={{ fontSize: "2rem", marginBottom: "0.875rem" }}>{icon}</div>
                <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: C.text, marginBottom: "0.5rem" }}>{title}</h3>
                <p style={{ fontSize: "0.9375rem", color: C.muted, lineHeight: 1.7, marginBottom: "0.875rem" }}>{desc}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                  {badges.map(b => <span key={b} style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.25rem 0.625rem", borderRadius: 99, background: C.greenLight, color: C.green }}>{b}</span>)}
                </div>
              </div>
            </Slide>
          ))}
        </CardCarousel>
      </div>
    </section>
  );
}

function FeaturesGrid() {
  return (
    <section id="features" style={{ background: C.bg, padding: "5rem 1.25rem" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        <SectionHeader title="എല്ലാം ഒരു platform-ൽ" sub="Vattavada-ക്കായി design ചെയ്‌ത features" />
        <CardCarousel itemCount={FEATURES.length}>
          {FEATURES.map(({ icon, title, desc }) => (
            <Slide key={title}>
              <div style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: "1.125rem", padding: "1.625rem", height: "100%", boxSizing: "border-box" }}>
                <div style={{ fontSize: "2.25rem", marginBottom: "0.875rem" }}>{icon}</div>
                <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: C.text, marginBottom: "0.5rem" }}>{title}</h3>
                <p style={{ fontSize: "0.9375rem", color: C.muted, lineHeight: 1.7 }}>{desc}</p>
              </div>
            </Slide>
          ))}
        </CardCarousel>
      </div>
    </section>
  );
}

function AccountsPanel() {
  const rows = [
    { id: "#1042", name: "Ravi Nair",                         pct: 100, barColor: C.green,   label: "Paid ✓",    labelColor: C.green   },
    { id: "#1043", name: "Priya S · ₹5,500 of ₹9,000",       pct: 61,  barColor: C.amber,   label: "Part paid", labelColor: "#d97706" },
    { id: "#1044", name: "Anoop K",                           pct: 0,   barColor: "#dc2626", label: "Pending",   labelColor: "#dc2626" },
  ];
  return (
    <section style={{ background: "#f0fdf4", padding: "5rem 1.25rem" }}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center" style={{ maxWidth: 940, margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          <div style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: "1rem", padding: "1.125rem", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.5rem", textAlign: "center" }}>
            {[["₹84,500","Collected",C.green],["₹12,000","Pending",C.amber],["23","Bookings",C.text]].map(([v,l,col]) => (
              <div key={l as string}>
                <div style={{ ...serif, fontSize: "1.375rem", fontWeight: 700, color: col as string }}>{v}</div>
                <div style={{ fontSize: "0.75rem", color: C.muted, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
          {rows.map(({ id, name, pct, barColor, label, labelColor }) => (
            <div key={id} style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: "0.875rem", padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.875rem" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.875rem", color: C.muted, marginBottom: "0.375rem" }}>Booking {id} · {name}</p>
                <div style={{ height: 6, borderRadius: 99, background: "#f5f5f4", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 99 }} />
                </div>
              </div>
              <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: labelColor, whiteSpace: "nowrap" }}>{label}</span>
            </div>
          ))}
          <div style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: "0.875rem", padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.9375rem", color: C.muted }}>📥 May 2026 bookings.csv</span>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, background: C.greenLight, color: C.green, padding: "0.25rem 0.875rem", borderRadius: 99 }}>Export ready</span>
          </div>
        </div>
        <div>
          <h2 style={{ ...serif, fontSize: "clamp(1.625rem,3vw,2.25rem)", fontWeight: 700, color: C.text, marginBottom: "1rem", lineHeight: 1.3 }}>Accounts &amp; Payment Tracking — ഒരു place-ൽ</h2>
          <p style={{ fontSize: "1.0625rem", color: C.muted, lineHeight: 1.8, marginBottom: "1.25rem" }}>ഓരോ booking-ന്റെയും payment real-time-ൽ track ചെയ്യാം. Month end-ൽ CSV export ചെയ്‌ത് accountant-ന് share ചെയ്യൂ. Tax season easy ആകും.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {["📊 Revenue overview","🧾 Auto invoice","💰 Part-payment tracking","📥 CSV export","📱 Mobile-first"].map(t => (
              <span key={t} style={{ fontSize: "0.875rem", fontWeight: 500, background: C.greenLight, color: C.green, border: `1px solid ${C.greenMid}`, padding: "0.375rem 1rem", borderRadius: 99 }}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TwoGSimulator() {
  const [simOn, setSimOn] = useState(false);
  const items = [
    { normal: "Maps SDK → Native deep link (saves 1.5 MB)",        active: "✅ Heavy Maps SDK removed → Native deep link active (1.5 MB saved)" },
    { normal: "Images → Auto-compressed WebP (saves 600 KB)",      active: "✅ Dynamic images → Ultra-light WebP served (600 KB saved)" },
    { normal: "Fonts → System fonts on guest page (saves 80 KB)",  active: "✅ Web fonts dropped → System fonts loaded (80 KB saved)" },
    { normal: "PWA shell cached → Works offline after first load", active: "✅ PWA shell cached → Page loads offline with zero data" },
  ];
  return (
    <section style={{ background: C.dark, padding: "5rem 1.25rem" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        <SectionHeader light title="Range കുറഞ്ഞാലും booking കിട്ടും" sub="Vattavada-ൽ 2G signal-ൽ ഞങ്ങളുടെ platform exactly how ആണ് load ആകുന്നത് — see for yourself" />
        <div style={{ background: "#292524", border: "1px solid #44403c", borderRadius: "1.5rem", padding: "2.5rem", maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
          <h3 style={{ ...serif, fontSize: "1.5rem", fontWeight: 700, color: "#fafaf9", marginBottom: "0.625rem" }}>📡 2G Network Optimizer</h3>
          <p style={{ color: "#a8a29e", fontSize: "1rem", marginBottom: "2rem" }}>Simulate ചെയ്‌ത് കണ്ടോളൂ — weak signal-ൽ stayidom.in guest page exactly how ആണ് load ആകുന്നത്</p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, justifyContent: "center", marginBottom: "0.5rem" }}>
            {[8,14,20,26,32].map((h,i) => <div key={i} style={{ width: 8, height: h, borderRadius: 2, background: simOn && i>1 ? "#44403c" : "#4ade80", transition: "background .3s" }} />)}
          </div>
          <p style={{ fontSize: "0.875rem", color: "#a8a29e", marginBottom: "1.5rem" }}>{simOn ? "📶 2G / E — Low Signal Mode Active" : "📶 Full Signal — Normal Mode"}</p>
          <button onClick={() => setSimOn(v=>!v)} style={{ background: simOn ? "#ef4444" : C.amber, color: simOn ? "#fff" : C.dark, border: "none", padding: "0.875rem 2rem", borderRadius: 99, fontSize: "1rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "background .2s" }}>
            {simOn ? "Exit Low Signal Mode" : "Simulate Low Signal Mode"}
          </button>
          <div className="grid grid-cols-3 gap-3 mt-8">
            {[{ label:"Page weight",val:"180 KB" },{ label:"2G load time",val:"< 4s" },{ label:"Maps SDK",val:"0 KB" }].map(({ label,val }) => (
              <div key={label} style={{ background: C.dark, border: "1px solid #292524", borderRadius: "0.875rem", padding: "1rem", textAlign: "center" }}>
                <div style={{ ...serif, fontSize: "1.375rem", fontWeight: 700, color: "#4ade80", marginBottom: "0.25rem" }}>{val}</div>
                <div style={{ fontSize: "0.8125rem", color: "#a8a29e" }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "left", marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {items.map(({ normal, active }) => (
              <div key={normal} style={{ background: C.dark, borderRadius: "0.75rem", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.9375rem" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, background: "#4ade80" }} />
                <span style={{ color: "#86efac" }}>{simOn ? active : normal}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SavingsCalculator() {
  const [bookings, setBookings] = useState(20);
  const [rate, setRate]         = useState(3000);
  const commission  = Math.round(bookings * rate * 0.2);
  const stayidomFee = 1000;
  const saved       = Math.max(0, commission - stayidomFee);
  return (
    <section style={{ background: C.dark, padding: "5rem 1.25rem" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        <SectionHeader light title="നിങ്ങൾ എത്ര save ചെയ്യും?" sub="Sliders move ചെയ്‌ത് നോക്കൂ" />
        <div style={{ background: "#292524", border: "1px solid #44403c", borderRadius: "1.5rem", padding: "2.25rem", maxWidth: 680, margin: "0 auto" }}>
          {[
            { id:"b", label:"ഒരു മാസം bookings", min:5,   max:80,    step:1,   val:bookings, display:String(bookings),                 set:setBookings },
            { id:"r", label:"Average room rate",  min:500, max:10000, step:100, val:rate,     display:`₹${rate.toLocaleString("en-IN")}`, set:setRate },
          ].map(({ id, label, min, max, step, val, display, set }) => (
            <div key={id} style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <label htmlFor={id} style={{ fontSize: "0.9375rem", color: "#a8a29e" }}>{label}</label>
                <span style={{ ...serif, fontSize: "1.375rem", fontWeight: 700, color: C.amber }}>{display}</span>
              </div>
              <input id={id} type="range" min={min} max={max} step={step} value={val} onChange={e => set(Number(e.target.value))} style={{ width: "100%", accentColor: C.amber, cursor: "pointer" }} />
            </div>
          ))}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label:"Platform commission (20%)", val:`₹${commission.toLocaleString("en-IN")}`, bg:"#3f2828", border:"#7f1d1d", color:"#fca5a5" },
              { label:"stayidom cost",              val:`₹${stayidomFee.toLocaleString("en-IN")}`, bg:"#1c2e22", border:C.green,   color:"#86efac" },
              { label:"നിങ്ങൾ save ചെയ്യും",        val:`₹${saved.toLocaleString("en-IN")}`,       bg:"#2d2208", border:C.amber,   color:"#fbbf24" },
            ].map(({ label, val, bg, border, color }) => (
              <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: "0.875rem", padding: "1.125rem", textAlign: "center" }}>
                <p style={{ fontSize: "0.875rem", color: "#a8a29e", marginBottom: "0.5rem" }}>{label}</p>
                <p style={{ ...serif, fontSize: "1.625rem", fontWeight: 700, color }}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  return (
    <section id="testimonials" style={{ background: C.bg, padding: "5rem 1.25rem" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        <SectionHeader title="Vattavada Owners പറയുന്നത്" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map(({ name, property, quote, saving }) => (
            <div key={name} style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: "1.25rem", padding: "1.875rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <p style={{ fontSize: "1rem", color: "#44403c", lineHeight: 1.8, flex: 1, fontStyle: "italic" }}>"{quote}"</p>
              <div>
                <span style={{ display: "inline-block", fontSize: "0.875rem", fontWeight: 600, background: C.greenLight, color: C.green, padding: "0.3125rem 0.875rem", borderRadius: 99, marginBottom: "0.625rem" }}>{saving}</span>
                <p style={{ fontSize: "0.9375rem", fontWeight: 700, color: C.text }}>{name}</p>
                <p style={{ fontSize: "0.875rem", color: C.muted }}>{property}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const [openIndex, setOpenIndex] = useState<number>(0);
  return (
    <section id="faq" style={{ background: "#f0fdf4", padding: "5rem 1.25rem" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        <SectionHeader title="Frequently Asked Questions" sub="Owners ചോദിക്കുന്ന questions — honest answers" />
        <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {FAQS.map(({ q, a }, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={q} style={{ background: "#fff", border: `1px solid ${C.greenMid}`, borderRadius: "1rem", overflow: "hidden" }}>
                <button onClick={() => setOpenIndex(isOpen ? -1 : i)} style={{ width: "100%", padding: "1.125rem 1.25rem", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", fontSize: "1rem", fontWeight: 700, color: C.text, fontFamily: "inherit" }}>
                  {q}
                  <span style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .25s", fontSize: "0.875rem", color: C.green, flexShrink: 0, marginLeft: "1rem" }}>▾</span>
                </button>
                {isOpen && <div style={{ padding: "0 1.25rem 1.125rem" }}><p style={{ fontSize: "0.9375rem", color: C.muted, lineHeight: 1.8 }}>{a}</p></div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const FEATURE_ROWS: {
  category: string;
  features: { label: string; starter: true | null; growth: true | string | null; pro: true | string | null }[];
}[] = [
  { category: "Booking Website", features: [
    { label: "Branded subdomain (yourplace.stayidom.in)", starter: true,  growth: true,  pro: true },
    { label: "Mobile-first guest booking page",            starter: true,  growth: true,  pro: true },
    { label: "WhatsApp booking deep link",                 starter: true,  growth: true,  pro: true },
    { label: "Room & availability management",             starter: true,  growth: true,  pro: true },
    { label: "Custom branding — colors & font",            starter: null,  growth: true,  pro: true },
    { label: "Offline directions (Google Maps deep link)", starter: true,  growth: true,  pro: true },
    { label: "SEO meta tags + Open Graph",                 starter: null,  growth: true,  pro: true },
  ]},
  { category: "Payments & Accounts", features: [
    { label: "UPI / Cash / Bank payment recording",        starter: true,  growth: true,  pro: true },
    { label: "Part-payment & advance tracking",            starter: true,  growth: true,  pro: true },
    { label: "Auto invoice generation (PDF)",              starter: null,  growth: true,  pro: true },
    { label: "Monthly accounts overview",                  starter: null,  growth: true,  pro: true },
    { label: "CSV export — bookings & payments",           starter: null,  growth: true,  pro: true },
  ]},
  { category: "Guest Experience", features: [
    { label: "Live booking status for guests",             starter: true,  growth: true,  pro: true },
    { label: "Guest booking tracking page",                starter: null,  growth: true,  pro: true },
    { label: "Seasonal & weekend price multipliers",       starter: null,  growth: true,  pro: true },
    { label: "Multiple room types & complex pricing",      starter: null,  growth: true,  pro: true },
  ]},
  { category: "WhatsApp & Communication", features: [
    { label: "WhatsApp booking notification to owner",     starter: true,  growth: true,  pro: true },
    { label: "WhatsApp message templates (confirm, reminder, directions)", starter: null, growth: true, pro: true },
    { label: "Payment reminder template",                  starter: null,  growth: true,  pro: true },
  ]},
  { category: "Support & Onboarding", features: [
    { label: "Self-serve setup",                           starter: true,  growth: true,  pro: true },
    { label: "Guided onboarding support",                  starter: null,  growth: true,  pro: true },
    { label: "Priority setup + dedicated WhatsApp support",starter: null,  growth: null,  pro: true },
  ]},
];

const TIER_META = [
  { key: "starter", label: "Starter", name:"1–5 rooms", highlight: false },
  { key: "growth",  label: "Growth",  name:"6–10 rooms",highlight: true  },
  { key: "pro",     label: "Pro",     name:"10+ rooms", highlight: false },
];

function FeatureCell({ val }: { val: true | string | null }) {
  if (val === null) return <span style={{ color: "#d1d5db", fontSize: "1rem" }}>—</span>;
  if (typeof val === "string") return <span style={{ fontSize: "0.8125rem", color: C.green, fontWeight: 500 }}>{val}</span>;
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: C.greenLight, color: C.green, fontSize: "0.75rem", fontWeight: 700 }}>✓</span>;
}

function Pricing({ onSelectTier }: { onSelectTier: (tier: string) => void }) {
  return (
    <section id="pricing" style={{ background: C.bg, padding: "5rem 1.25rem" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        <SectionHeader title="Simple, Transparent Pricing" sub="Commission ഇല്ല · Contract ഇല്ല · 14 days free trial" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end" style={{ marginBottom: "3rem" }}>
          {[
            { tier: "starter", label: "Starter", rooms: "1–5 മുറികൾ", setup: "₹5,000",  monthly: "₹1,000 / മാസം", highlight: false, tagline: "ചെറിയ homestay-ന് perfect starting point" },
            { tier: "growth",  label: "Growth",  rooms: "6–10 മുറികൾ", setup: "₹10,000", monthly: "₹1,500 / മാസം", highlight: true,  tagline: "Direct bookings grow ചെയ്യുന്ന active property-ന്" },
            { tier: "pro",     label: "Pro",     rooms: "10+ മുറികൾ",  setup: "₹25,000", monthly: "₹2,000 / മാസം", highlight: false, tagline: "Large property അല്ലെങ്കിൽ resort-style stay" },
          ].map(({ tier, label, rooms, setup, monthly, highlight, tagline }) => (
            <div key={tier} className={highlight ? "md:scale-105" : ""} style={{ background: highlight ? C.green : "#fff", border: highlight ? "2px solid #14532d" : `1px solid ${C.greenMid}`, borderRadius: "1.25rem", padding: "2rem", display: "flex", flexDirection: "column", gap: "1rem", boxShadow: highlight ? "0 20px 50px rgba(22,101,52,.25)" : "none" }}>
              {highlight && <span style={{ fontSize: "0.75rem", fontWeight: 700, background: C.amber, color: C.dark, padding: "0.25rem 0.75rem", borderRadius: 99, alignSelf: "flex-start" }}>⭐ Most Popular</span>}
              <div>
                <div style={{ fontSize: "1.25rem", fontWeight: 700, color: highlight ? "#fff" : C.text, marginBottom: "0.125rem" }}>{label}</div>
                <div style={{ fontSize: "0.875rem", color: highlight ? C.greenLight : C.muted }}>{rooms}</div>
              </div>
              <p style={{ fontSize: "0.875rem", color: highlight ? "rgba(255,255,255,.75)" : C.muted, lineHeight: 1.6 }}>{tagline}</p>
              <div style={{ borderTop: `1px solid ${highlight ? "rgba(255,255,255,.15)" : "#f0fdf4"}`, paddingTop: "1rem" }}>
                <div style={{ ...serif, fontSize: "2rem", fontWeight: 700, color: highlight ? "#fff" : C.green }}>{setup}</div>
                <div style={{ fontSize: "0.8125rem", color: highlight ? C.greenLight : C.muted, marginBottom: "0.375rem" }}>one-time setup</div>
                <div style={{ fontSize: "1rem", fontWeight: 600, color: highlight ? "#f0fdf4" : C.text }}>+ {monthly}</div>
              </div>
              <button onClick={() => onSelectTier(tier)} style={{ textAlign: "center", padding: "0.9375rem 1rem", borderRadius: 99, fontSize: "0.9375rem", fontWeight: 700, display: "block", marginTop: "0.5rem", background: highlight ? C.amber : C.green, color: highlight ? C.dark : "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
                Get Started — 14 days free
              </button>
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", border: `1px solid ${C.greenMid}`, borderRadius: "1.25rem", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderBottom: `2px solid ${C.greenMid}` }}>
            <div style={{ padding: "1rem 1.25rem", fontSize: "0.8125rem", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Feature</div>
            {TIER_META.map(({ key, label, highlight }) => (
              <div key={key} style={{ padding: "1rem 0.75rem", textAlign: "center", fontWeight: 700, fontSize: "0.9375rem", background: highlight ? C.green : "transparent", color: highlight ? "#fff" : C.text, borderLeft: `1px solid ${C.greenMid}` }}>
                {label}
                {highlight && <div style={{ fontSize: "0.6875rem", color: C.greenLight, fontWeight: 500, marginTop: 2 }}>Most Popular</div>}
              </div>
            ))}
          </div>
          {FEATURE_ROWS.map(({ category, features }, ci) => (
            <div key={category}>
              <div style={{ padding: "0.75rem 1.25rem", background: "#f9fef9", borderTop: ci > 0 ? `1px solid ${C.greenMid}` : "none" }}>
                <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: "0.06em" }}>{category}</span>
              </div>
              {features.map(({ label, starter, growth, pro }, fi) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderTop: "1px solid #f0fdf4", background: fi % 2 === 0 ? "#fff" : "#fafef9" }}>
                  <div style={{ padding: "0.875rem 1.25rem", fontSize: "0.9rem", color: C.text, display: "flex", alignItems: "center" }}>{label}</div>
                  {[starter, growth, pro].map((val, i) => (
                    <div key={i} style={{ padding: "0.875rem 0.75rem", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", borderLeft: `1px solid ${C.greenMid}`, background: i === 1 ? "#f0fdf4" : "transparent" }}>
                      <FeatureCell val={val} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderTop: `2px solid ${C.greenMid}`, background: "#f9fef9" }}>
            <div style={{ padding: "1.25rem" }} />
            {TIER_META.map(({ key, highlight }) => (
              <div key={key} style={{ padding: "1rem 0.75rem", textAlign: "center", borderLeft: `1px solid ${C.greenMid}`, background: highlight ? C.greenLight : "transparent" }}>
                <button onClick={() => onSelectTier(key)} style={{ display: "inline-block", padding: "0.625rem 1.25rem", borderRadius: 99, fontSize: "0.875rem", fontWeight: 700, background: highlight ? C.green : "transparent", color: highlight ? "#fff" : C.green, border: highlight ? "none" : `1.5px solid ${C.green}`, cursor: "pointer", fontFamily: "inherit" }}>
                  Get Started
                </button>
              </div>
            ))}
          </div>
        </div>
        <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.9375rem", color: C.muted }}>* Hidden charges ഇല്ല · Commission ഇല്ല · Cancel anytime</p>
      </div>
    </section>
  );
}

function SignupCTA({ preselectedTier }: { preselectedTier: string }) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [form, setForm]           = useState({ name: "", phone: "", property: "", tier: preselectedTier });

  if (form.tier !== preselectedTier && preselectedTier !== "") {
    setForm(f => ({ ...f, tier: preselectedTier }));
  }

  const inputStyle: React.CSSProperties = { width: "100%", padding: "0.9375rem 1.125rem", borderRadius: "0.875rem", border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.14)", color: "#fff", fontSize: "1rem", outline: "none", fontFamily: "inherit", boxSizing: "border-box" };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { await submitLead({ name: form.name, phone: form.phone, property_name: form.property, tier: form.tier }); } catch {}
    finally { setLoading(false); setSubmitted(true); }
  };

  return (
    <section id="signup" style={{ background: "linear-gradient(155deg,#166534,#14532d)", padding: "5rem 1.25rem", textAlign: "center" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <h2 style={{ ...serif, fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 700, color: "#fff", marginBottom: "0.75rem" }}>ഇന്ന് Free Demo ബുക്ക് ചെയ്യൂ</h2>
        <p style={{ color: C.greenLight, fontSize: "1rem", marginBottom: "2.25rem" }}>24 hours-ൽ ഞങ്ങൾ WhatsApp-ൽ contact ചെയ്യും. Zero obligation.</p>
        {submitted ? (
          <div style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)", borderRadius: "1.25rem", padding: "2.5rem", color: "#fff" }}>
            <div style={{ fontSize: "3rem", marginBottom: "0.875rem" }}>🌿</div>
            <p style={{ fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.5rem" }}>നന്ദി!</p>
            <p style={{ color: C.greenLight, fontSize: "1rem" }}>ഞങ്ങൾ 24 hours-ൽ WhatsApp-ൽ reach ചെയ്യും.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.18)", borderRadius: "1.25rem", padding: "2rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <input type="text" placeholder="നിങ്ങളുടെ പേര്"         required style={inputStyle} value={form.name}     onChange={e => setForm(f=>({...f,name:e.target.value}))} />
            <input type="tel"  placeholder="WhatsApp Number"          required style={inputStyle} value={form.phone}    onChange={e => setForm(f=>({...f,phone:e.target.value}))} />
            <input type="text" placeholder="Homestay name (optional)"         style={inputStyle} value={form.property} onChange={e => setForm(f=>({...f,property:e.target.value}))} />
            <select value={form.tier} onChange={e => setForm(f=>({...f,tier:e.target.value}))} style={{ ...inputStyle, appearance: "none", WebkitAppearance: "none" }}>
              <option value="">Plan select ചെയ്യൂ (optional)</option>
              <option value="starter">Starter — 1–5 rooms · ₹5,000 setup</option>
              <option value="growth">Growth — 6–10 rooms · ₹10,000 setup</option>
              <option value="pro">Pro — 10+ rooms · ₹25,000 setup</option>
            </select>
            <button type="submit" disabled={loading} style={{ background: C.amber, color: C.dark, border: "none", padding: "1.0625rem", borderRadius: 99, fontSize: "1.0625rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1, marginTop: "0.5rem" }}>
              {loading ? "Submitting..." : "Free Demo ബുക്ക് ചെയ്യൂ →"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ background: C.dark, color: C.muted, borderTop: "1px solid #292524", padding: "2.5rem 1.25rem" }}>
      <div style={{ maxWidth: 940, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem", fontSize: "0.9375rem" }}>
        <span style={{ ...serif, color: "#a8a29e", fontSize: "1.0625rem" }}>
          <span style={{ color: "#4ade80" }}>stay</span>idom<span style={{ color: C.amber }}>.in</span>
        </span>
        <span>Built for Vattavada 🌿 · Kerala · India</span>
        <span>© {new Date().getFullYear()} stayidom.in · All rights reserved</span>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  const [selectedTier, setSelectedTier] = useState("");
  const [modalOpen, setModalOpen]       = useState(false);

  const handleSelectTier = useCallback((tier: string) => {
    setSelectedTier(tier);
    setModalOpen(true);
  }, []);

  const handleDemoClick = useCallback(() => {
    setSelectedTier("");
    setModalOpen(true);
  }, []);

  return (
    <main style={{ fontFamily: "'Noto Sans Malayalam','Segoe UI',system-ui,sans-serif", overflowX: "hidden", width: "100%", maxWidth: "100vw" }}>
      <DemoModal isOpen={modalOpen} onClose={() => setModalOpen(false)} preselectedTier={selectedTier} />
      <Navbar onDemoClick={handleDemoClick} />
      <Hero onDemoClick={handleDemoClick} />
      <TrustBar />
      <ProblemStrip />
      <PhoneMockup />
      <WhatsAppFlow />
      <DirectPayment />
      <ComparisonTable />
      <GuestTrustSignals />
      <FeaturesGrid />
      <AccountsPanel />
      <TwoGSimulator />
      <SavingsCalculator />
      <Testimonials />
      <FAQ />
      <Pricing onSelectTier={handleSelectTier} />
      <SignupCTA preselectedTier={selectedTier} />
      <Footer />
    </main>
  );
}
