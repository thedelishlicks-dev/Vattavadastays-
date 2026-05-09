import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export const useRoom = (roomId: string) => {
  return useQuery({
    queryKey: ["room", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select(`*, properties(*)`)
        .eq("id", roomId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!roomId,
  });
};
