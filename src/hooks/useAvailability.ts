import { useQuery } from "@tanstack/react-query";
import { checkRoomAvailability } from "../server/property";

export const useAvailability = (roomId: string, checkIn: string, checkOut: string) => {
  return useQuery({
    queryKey: ["availability", roomId, checkIn, checkOut],
    queryFn: () => checkRoomAvailability({ data: { roomId, checkIn, checkOut } }),
    enabled: !!roomId && !!checkIn && !!checkOut,
  });
};
