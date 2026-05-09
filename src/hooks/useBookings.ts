import { useQuery } from "@tanstack/react-query";
import { getPropertyBookings } from "../server/owner";
import { useAuth } from "./useAuth";

export const useBookings = (
  propertyId: string,
  filters?: { status?: string; from?: string; to?: string },
) => {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ["bookings", propertyId, filters],
    queryFn: () => getPropertyBookings({ data: { propertyId, filters } }),
    enabled: !!propertyId && isAuthenticated,
  });
};
