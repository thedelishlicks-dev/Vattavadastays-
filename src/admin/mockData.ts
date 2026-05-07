export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "partial" | "paid";

export type AdminBooking = {
  id: string;
  guest: string;
  phone: string;
  room: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  guests: number;
  amount: number;
  status: BookingStatus;
  payment: PaymentStatus;
};

export const BOOKINGS: AdminBooking[] = [
  {
    id: "BK-1042",
    guest: "Anjali Menon",
    phone: "+91 98470 11122",
    room: "Deluxe Valley View",
    checkIn: "2026-05-08",
    checkOut: "2026-05-10",
    guests: 2,
    amount: 7300,
    status: "confirmed",
    payment: "partial",
  },
  {
    id: "BK-1043",
    guest: "Vikram Shah",
    phone: "+91 99204 55781",
    room: "Family Cottage",
    checkIn: "2026-05-09",
    checkOut: "2026-05-12",
    guests: 4,
    amount: 14100,
    status: "pending",
    payment: "unpaid",
  },
  {
    id: "BK-1044",
    guest: "Neha Pillai",
    phone: "+91 90370 67234",
    room: "Standard Double",
    checkIn: "2026-05-12",
    checkOut: "2026-05-14",
    guests: 2,
    amount: 4300,
    status: "confirmed",
    payment: "paid",
  },
  {
    id: "BK-1045",
    guest: "Arjun Das",
    phone: "+91 88912 31900",
    room: "Mountain Dormitory",
    checkIn: "2026-05-15",
    checkOut: "2026-05-17",
    guests: 6,
    amount: 9900,
    status: "pending",
    payment: "unpaid",
  },
  {
    id: "BK-1046",
    guest: "Priya R.",
    phone: "+91 95440 98765",
    room: "Deluxe Garden Suite",
    checkIn: "2026-05-18",
    checkOut: "2026-05-20",
    guests: 3,
    amount: 6700,
    status: "confirmed",
    payment: "paid",
  },
  {
    id: "BK-1039",
    guest: "Mohammed Saif",
    phone: "+91 97455 13344",
    room: "Deluxe Valley View",
    checkIn: "2026-04-29",
    checkOut: "2026-05-02",
    guests: 2,
    amount: 10800,
    status: "completed",
    payment: "paid",
  },
  {
    id: "BK-1040",
    guest: "Lakshmi Iyer",
    phone: "+91 98765 43210",
    room: "Family Cottage",
    checkIn: "2026-04-25",
    checkOut: "2026-04-28",
    guests: 5,
    amount: 14100,
    status: "completed",
    payment: "paid",
  },
  {
    id: "BK-1041",
    guest: "Tom George",
    phone: "+91 90000 22221",
    room: "Standard Double",
    checkIn: "2026-05-01",
    checkOut: "2026-05-03",
    guests: 2,
    amount: 4300,
    status: "cancelled",
    payment: "unpaid",
  },
];

export const STATS = {
  upcomingBookings: BOOKINGS.filter((b) => b.status === "confirmed" || b.status === "pending")
    .length,
  monthlyRevenue: BOOKINGS.filter((b) => b.payment !== "unpaid").reduce((s, b) => s + b.amount, 0),
  occupancyRate: 68,
  newInquiries: 5,
};

export type CalendarStatus = "available" | "booked" | "blocked";
