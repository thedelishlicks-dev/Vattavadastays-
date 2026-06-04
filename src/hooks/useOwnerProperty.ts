import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { isSuperAdminEmail } from "@/lib/subdomain";

/**
 * useOwnerProperty
 *
 * For normal owners: fetches the property where owner_id = auth.uid()
 *
 * For superadmin managing a property (/admin?property=subdomain):
 * fetches by subdomain instead, since the superadmin is not the owner.
 * The subdomain is read from the URL search param.
 */
export const useOwnerProperty = () => {
  const { user, isAuthenticated } = useAuth();
  const isSuperAdmin = isSuperAdminEmail(user?.email);

  // Read ?property=subdomain from URL if superadmin
  const propertySubdomain = isSuperAdmin
    ? new URLSearchParams(window.location.search).get('property') ?? ''
    : '';

  return useQuery({
    queryKey: ["ownerProperty", user?.id, propertySubdomain],
    queryFn: async () => {
      if (isSuperAdmin && propertySubdomain) {
        // Superadmin: fetch by subdomain
        const { data, error } = await supabase
          .from("properties")
          .select(`*, rooms(*)`)
          .eq("subdomain", propertySubdomain)
          .single();
        if (error) throw error;
        return data;
      }

      // Normal owner: fetch by owner_id
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
