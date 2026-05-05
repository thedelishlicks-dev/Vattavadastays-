import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminLayout } from "@/admin/AdminLayout";
import { isAuthed } from "@/admin/auth";

export const Route = createFileRoute("/admin")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/admin/login") return;
    if (!isAuthed()) {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminLayout,
});
