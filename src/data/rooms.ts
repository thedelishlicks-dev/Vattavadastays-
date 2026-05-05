export type RoomType = "Deluxe" | "Standard" | "Family" | "Dormitory";

export type Room = {
  id: string;
  name: string;
  type: RoomType;
  price: number;
  capacity: number;
  bedType: string;
  bathType: "Attached" | "Shared";
  amenities: string[]; // includes flags like "AC", "Balcony", "Kitchen", "Attach Bath"
  extraBedPrice: number;
  image: string;
};

import cottage from "@/assets/cottage.jpg";
import strawberry from "@/assets/strawberry.jpg";
import bonfire from "@/assets/bonfire.jpg";
import hero from "@/assets/hero-tea.jpg";

export const ROOMS: Room[] = [
  {
    id: "deluxe-valley",
    name: "Deluxe Valley View",
    type: "Deluxe",
    price: 3500,
    capacity: 2,
    bedType: "King",
    bathType: "Attached",
    amenities: ["AC", "Attach Bath", "Balcony", "Valley View"],
    extraBedPrice: 600,
    image: cottage,
  },
  {
    id: "deluxe-garden",
    name: "Deluxe Garden Suite",
    type: "Deluxe",
    price: 3200,
    capacity: 3,
    bedType: "Queen + Sofa",
    bathType: "Attached",
    amenities: ["AC", "Attach Bath", "Balcony", "Kitchen"],
    extraBedPrice: 600,
    image: strawberry,
  },
  {
    id: "standard-double",
    name: "Standard Double",
    type: "Standard",
    price: 2000,
    capacity: 2,
    bedType: "Double",
    bathType: "Attached",
    amenities: ["Attach Bath"],
    extraBedPrice: 500,
    image: bonfire,
  },
  {
    id: "family-cottage",
    name: "Family Cottage",
    type: "Family",
    price: 4500,
    capacity: 5,
    bedType: "1 King + 2 Twin",
    bathType: "Attached",
    amenities: ["Attach Bath", "Balcony", "Kitchen"],
    extraBedPrice: 700,
    image: hero,
  },
  {
    id: "dormitory",
    name: "Mountain Dormitory",
    type: "Dormitory",
    price: 800,
    capacity: 8,
    bedType: "8 Bunk Beds",
    bathType: "Shared",
    amenities: [],
    extraBedPrice: 0,
    image: cottage,
  },
];
