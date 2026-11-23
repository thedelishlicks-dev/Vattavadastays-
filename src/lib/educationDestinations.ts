// src/lib/educationDestinations.ts
//
// The ONLY places an Education lesson may send the owner. Each key maps to a real owner screen.
// Nothing here is a redirect (so /admin/pricing is deliberately absent: it forwards to Rooms &
// Pricing, which is listed as `rooms`) and nothing is invented: there is no Sources screen and no
// Guests screen, because source editing and guest history live inside a booking (use `bookings`).
//
// education.test.ts checks every path against the navigation (src/admin/navConfig.ts) and against
// the route files in src/routes/, so a renamed or removed screen fails a test instead of sending an
// owner to a dead page.

export const EDUCATION_DESTINATIONS = {
  home: { to: "/admin/dashboard", screen: "Home" },
  calendar: { to: "/admin/calendar", screen: "Calendar" },
  bookings: { to: "/admin/bookings", screen: "Bookings" },
  quotes: { to: "/admin/quotes", screen: "Bookings → Quotes" },
  money: { to: "/admin/money", screen: "Money → Overview" },
  report: { to: "/admin/report", screen: "Money → Monthly report" },
  payments: { to: "/admin/payments", screen: "Money → Payments" },
  expenses: { to: "/admin/expenses", screen: "Money → Expenses" },
  rooms: { to: "/admin/rooms", screen: "Rooms & Pricing" },
  settings: { to: "/admin/settings", screen: "Property → Settings" },
  amenities: { to: "/admin/amenities", screen: "Property → Amenities" },
  policies: { to: "/admin/policies", screen: "Property → Policies" },
  addons: { to: "/admin/addons", screen: "Property → Add-ons" },
} as const;

export type EducationDestinationKey = keyof typeof EDUCATION_DESTINATIONS;

export function isDestinationKey(key: string): key is EducationDestinationKey {
  return Object.prototype.hasOwnProperty.call(EDUCATION_DESTINATIONS, key);
}
