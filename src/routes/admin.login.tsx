import { createFileRoute, redirect } from "@tanstack/react-router";

// Old owner-login URL, kept so bookmarks and old links still work. The one login page is
// /login (it also sends super admins to /superadmin and navigates without a full reload).
export const Route = createFileRoute("/admin/login")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
