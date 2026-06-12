import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { isSuperAdminEmail } from "@/lib/subdomain";

export const useOwnerProperty = () => {
  const { user, isAuthenticated } = useAuth();
  const isSuperAdmin = isSuperAdminEmail(user?.email);

  const paramFromUrl = isSuperAdmin
    ? new URLSearchParams(window.location.search).get('property') ?? ''
    : '';

  if (isSuperAdmin && paramFromUrl) {
    sessionStorage.setItem('adminPropertySubdomain', paramFromUrl);
  }

  const propertySubdomain = isSuperAdmin
    ? paramFromUrl || sessionStorage.getItem('adminPropertySubdomain') || ''
    : '';

  return useQuery({
    queryKey: ["ownerProperty", user?.id, propertySubdomain],
    queryFn: async () => {
      if (isSuperAdmin && propertySubdomain) {
        const { data, error } = await supabase
          .from("properties")
          .select(`*, rooms(*)`)
          .eq("subdomain", propertySubdomain)
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("properties")
        .select(`*, rooms(*)`)
        .eq("owner_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: isAuthenticated && !!user?.id,
  });
};
