export interface Property {
  id: string;
  owner_id: string;
  name: string;
  name_ml?: string;
  subdomain: string;
  area?: string;
  location_lat?: number;
  location_lng?: number;
  shared_amenities: string[];
  hero_tagline?: string;
  description?: string;
  description_ml?: string;
  hero_image?: string;
  about_image?: string;
  owner_name?: string;
  owner_phone?: string;
  owner_whatsapp?: string;
  check_in_time: string;
  check_out_time: string;
  is_active: boolean;
  created_at: string;
}

export interface Room {
  id: string;
  property_id: string;
  name: string;
  name_ml?: string;
  room_type: string;
  max_guests: number;
  bed_type: string;
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
  price_override?: number;
  note?: string;
}

export interface Booking {
  id: string;
  property_id: string;
  room_id: string;
  guest_name: string;
  guest_phone: string;
  guest_email?: string;
  guest_count: number;
  check_in: string;
  check_out: string;
  nights: number;
  room_price: number;
  extra_guest_charge: number;
  total_amount: number;
  status: string;
  payment_method?: string;
  payment_reference?: string;
  is_paid: boolean;
  created_at: string;
}
