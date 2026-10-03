import { createFileRoute, redirect } from "@tanstack/react-router";

// The Pricing page was merged away:
//   • Room prices (base / weekend / extra guest) are edited in Rooms & Pricing →
//     tap a room's price (or the pencil) — one editor, one place.
//   • Seasons (which price add-ons & packages) moved to Property → Add-ons,
//     the page that actually uses them.
// This route stays so old bookmarks and links keep working: it forwards to
// Rooms, keeping the ?property= param used by superadmin "manage property".
export const Route = createFileRoute("/admin/pricing")({
  beforeLoad: () => {
    const prop = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("property") : null;
    throw redirect({ to: "/admin/rooms", search: (prop ? { property: prop } : {}) as never });
  },
});
