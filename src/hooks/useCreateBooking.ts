import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createBooking } from "../server/property";

export const useCreateBooking = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      property_id: string;
      room_id: string;
      guest_name: string;
      guest_phone: string;
      guest_email: string;
      guest_count: number;
      check_in: string;
      check_out: string;
      room_price: number;
      extra_guest_charge: number;
      total_amount: number;
    }) => createBooking({ data }),
    onSuccess: (bookingId, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["availability", variables.room_id],
      });
      return bookingId;
    },
  });
};
