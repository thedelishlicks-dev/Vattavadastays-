import { useQuery } from "@tanstack/react-query";
import { getOwnerProperty } from "../server/owner";
import { useAuth } from "./useAuth";

export const useOwnerProperty = () => {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ["ownerProperty"],
    queryFn: () => getOwnerProperty({ data: user?.id ?? "" }),
    enabled: isAuthenticated && !!user?.id,
  });
};
