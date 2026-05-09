import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminLayout } from "@/admin/AdminLayout";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/admin/login") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminLayout,
});
