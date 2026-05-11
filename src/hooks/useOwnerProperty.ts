import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export const useOwnerProperty = () => {
  const { user, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["ownerProperty", user?.id],
    queryFn: async () => {
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
