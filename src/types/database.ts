export type SubscriptionStatus = "trial" | "active" | "suspended";
export type SubscriptionTier = "small" | "large";
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
  logo_url?: string;
  hero_image?: string;
  about_image?: string;
  static_map_image_url?: string;
  landmark_description?: string;
  owner_name?: string;
  owner_phone?: string;
  owner_whatsapp?: string;
  check_in_time: string;
  check_out_time: string;
  is_active: boolean;
  theme?: string;
  heading_font?: string;
  created_at: string;
  subscription_status: SubscriptionStatus;
  subscription_tier: SubscriptionTier;
  monthly_fee: number;
  setup_fee_paid: boolean;
  setup_fee_amount: number;
  billing_notes: string | null;
  subscription_end_date: string | null;
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
  advance_amount: number;
  discount_amount: number;
  discount_reason?: string;
  group_id?: string;
  status: BookingStatus;
  payment_method?: string;
  payment_reference?: string;
  is_paid: boolean;
  checked_in_at?: string;
  checked_out_at?: string;
  invoice_notes?: string;
  created_at: string;
}
export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
export interface BookingCharge {
  id: string;
  booking_id: string;
  description: string;
  qty: number;
  unit_price: number;
  created_at: string;
}
export interface BookingGroup {
  id: string;
  property_id: string;
  group_reference: string;
  guest_name: string;
  guest_phone: string;
  guest_email?: string;
  check_in: string;
  check_out: string;
  guest_count: number;
  total_amount: number;
  advance_amount: number;
  discount_amount: number;
  discount_reason?: string;
  status: BookingStatus;
  payment_method?: string;
  payment_reference?: string;
  is_paid: boolean;
  created_at: string;
  // joined
  bookings?: Booking[];
}
