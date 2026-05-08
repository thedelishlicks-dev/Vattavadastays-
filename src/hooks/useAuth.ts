import { useQuery } from "@tanstack/react-query";
import { getSession } from "../lib/auth";

export const useAuth = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const user = data?.user ?? null;
  const isAuthenticated = !!user;

  return {
    user,
    isLoading,
    isAuthenticated,
  };
};
