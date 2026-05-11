import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export const useProperty = (subdomain: string) => {
  return useQuery({
    queryKey: ["property", subdomain],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select(`*, rooms(*)`)
        .eq("subdomain", subdomain)
        .eq("is_active", true)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!subdomain,
  });
};
