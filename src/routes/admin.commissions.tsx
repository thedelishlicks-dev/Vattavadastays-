import { createFileRoute, redirect } from "@tanstack/react-router";

// Commissions are now part of the combined Agents & Commissions page
// (/admin/agents) — one card per agent shows the rate, contact details,
// commission owed, and the bookings to mark paid. This route stays so old
// bookmarks and links keep working; it keeps the ?property= superadmin param.
export const Route = createFileRoute("/admin/commissions")({
  beforeLoad: () => {
    const prop = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("property") : null;
    throw redirect({ to: "/admin/agents", search: (prop ? { property: prop } : {}) as never });
  },
});
