import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminLayout } from "@/admin/AdminLayout";
import { getSession } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/admin/login") return;

    const { user } = await getSession();
    if (!user) {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminLayout,
});
