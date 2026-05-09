export interface Property {
  id: string;
  owner_id: string;
  name: string;
  name_ml: string | null;
  subdomain: string;
  area: string | null;
  location_lat: number | null;
  location_lng: number | null;
  shared_amenities: string[];
  description: string | null;
  description_ml: string | null;
  hero_image: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_whatsapp: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Room {
  id: string;
  property_id: string;
  name: string;
  name_ml: string | null;
  room_type: string | null;
  max_guests: number;
  bed_type: string | null;
  base_price: number;
  extra_guest_price: number;
  weekend_multiplier: number;
  room_amenities: string[];
  images: string[];
  is_active: boolean;
  created_at: string;
}

export interface Availability {
  room_id: string;
  date: string;
  is_available: boolean;
  price_override: number | null;
  note: string | null;
}

export interface Booking {
  id: string;
  property_id: string;
  room_id: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  guest_count: number;
  check_in: string;
  check_out: string;
  nights: number;
  room_price: number;
  extra_guest_charge: number;
  total_amount: number;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  payment_method: string | null;
  payment_reference: string | null;
  is_paid: boolean;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      properties: {
        Row: Property;
        Insert: Omit<Property, "id" | "created_at">;
        Update: Partial<Omit<Property, "id" | "created_at">>;
      };
      rooms: {
        Row: Room;
        Insert: Omit<Room, "id" | "created_at">;
        Update: Partial<Omit<Room, "id" | "created_at">>;
      };
      availability: {
        Row: Availability;
        Insert: Availability;
        Update: Partial<Availability>;
      };
      bookings: {
        Row: Booking;
        Insert: Omit<Booking, "id" | "created_at" | "nights">;
        Update: Partial<Omit<Booking, "id" | "created_at" | "nights">>;
      };
    };
  };
}
