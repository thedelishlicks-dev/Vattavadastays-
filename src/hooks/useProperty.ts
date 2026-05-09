import { useQuery } from "@tanstack/react-query";
import { getPropertyBySubdomain } from "../server/property";

export const useProperty = (subdomain: string) => {
  return useQuery({
    queryKey: ["property", subdomain],
    queryFn: () => getPropertyBySubdomain({ data: subdomain }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!subdomain,
  });
};
