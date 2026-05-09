import { useQuery } from "@tanstack/react-query";
import { getRoomById } from "../server/property";

export const useRoom = (roomId: string) => {
  return useQuery({
    queryKey: ["room", roomId],
    queryFn: () => getRoomById({ data: roomId }),
    enabled: !!roomId,
  });
};
