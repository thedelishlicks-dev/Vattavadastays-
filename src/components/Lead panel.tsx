// src/components/LeadsPanel.tsx
//
// Drop this into the superadmin dashboard page.
// Shows all demo requests from the marketing landing page.
//
// Usage in superadmin.index.tsx (or wherever your superadmin tabs live):
//
//   import LeadsPanel from "../components/LeadsPanel";
//   ...
//   <LeadsPanel />

import { useLeads } from "../hooks/useLeads";

const TIER_LABEL: Record<string, string> = {
  starter: "Starter · 1–5 rooms",
  growth:  "Growth · 6–10 rooms",
  pro:     "Pro · 10+ rooms",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function whatsappLink(phone: string, name: string) {
  const cleaned = phone.replace(/\D/g, "");
  const number  = cleaned.startsWith("91") ? cleaned : `91${cleaned}`;
  const msg     = encodeURIComponent(
    `Hi ${name}, thank you for your interest in stayidom.in! I'd love to show you a demo of how the platform works for your homestay. When would be a good time to connect?`
  );
  return `https://wa.me/${number}?text=${msg}`;
}

export default function LeadsPanel() {
  const { data: leads, isLoading, isError, refetch } = useLeads();

  if (isLoading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#78716c" }}>
        Loading demo requests…
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#dc2626" }}>
        Failed to load leads.{" "}
        <button onClick={() => refetch()} style={{ color: "#166534", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>
          Retry
        </button>
      </div>
    );
  }

  if (!leads || leads.length === 0) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#78716c" }}>
        No demo requests yet. Share the landing page to get started!
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#1c1917", marginBottom: "0.25rem" }}>
            Demo Requests
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#78716c" }}>
            {leads.length} lead{leads.length !== 1 ? "s" : ""} · Newest first
          </p>
        </div>
        <button
          onClick={() => refetch()}
          style={{ fontSize: "0.875rem", color: "#166534", background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 99, padding: "0.375rem 1rem", cursor: "pointer", fontFamily: "inherit" }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Mobile: stacked cards */}
      <div className="md:hidden" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {leads.map(lead => (
          <div key={lead.id} style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: "0.875rem", padding: "1rem 1.125rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
              <div>
                <p style={{ fontWeight: 700, color: "#1c1917", fontSize: "0.9375rem" }}>{lead.name}</p>
                <p style={{ fontSize: "0.8125rem", color: "#78716c" }}>{lead.property_name || "—"}</p>
              </div>
              {lead.tier && (
                <span style={{ fontSize: "0.75rem", fontWeight: 600, background: "#dcfce7", color: "#166534", padding: "0.25rem 0.625rem", borderRadius: 99, whiteSpace: "nowrap" }}>
                  {TIER_LABEL[lead.tier] ?? lead.tier}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontSize: "0.8125rem", color: "#78716c" }}>{formatDate(lead.created_at)}</p>
              <a href={whatsappLink(lead.phone, lead.name)} target="_blank" rel="noopener noreferrer"
                style={{ background: "#25D366", color: "#fff", borderRadius: 99, padding: "0.375rem 0.875rem", fontSize: "0.8125rem", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
                💬 {lead.phone}
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block" style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: "0.875rem", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ background: "#fafaf9", borderBottom: "1px solid #e7e5e4" }}>
              {["Name", "Property", "Plan", "Phone", "Date"].map(h => (
                <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", fontWeight: 600, color: "#78716c", fontSize: "0.8125rem" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead, i) => (
              <tr key={lead.id} style={{ borderBottom: i < leads.length - 1 ? "1px solid #f5f5f4" : "none", background: i % 2 === 0 ? "#fff" : "#fafaf9" }}>
                <td style={{ padding: "0.875rem 1rem", fontWeight: 600, color: "#1c1917" }}>{lead.name}</td>
                <td style={{ padding: "0.875rem 1rem", color: "#78716c" }}>{lead.property_name || "—"}</td>
                <td style={{ padding: "0.875rem 1rem" }}>
                  {lead.tier ? (
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, background: "#dcfce7", color: "#166534", padding: "0.25rem 0.625rem", borderRadius: 99 }}>
                      {TIER_LABEL[lead.tier] ?? lead.tier}
                    </span>
                  ) : <span style={{ color: "#d1d5db" }}>—</span>}
                </td>
                <td style={{ padding: "0.875rem 1rem" }}>
                  <a href={whatsappLink(lead.phone, lead.name)} target="_blank" rel="noopener noreferrer"
                    style={{ color: "#166534", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.375rem", textDecoration: "none" }}>
                    💬 {lead.phone}
                  </a>
                </td>
                <td style={{ padding: "0.875rem 1rem", color: "#78716c", fontSize: "0.8125rem" }}>{formatDate(lead.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
