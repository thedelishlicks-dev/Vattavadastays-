import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalogEnquiryText, catalogEnquiryLink } from "./whatsapp";

test("one message lists every ticked item", () => {
  const t = buildCatalogEnquiryText({ propertyName: "Hill View", items: ["Honeymoon (₹4,000 per group)", "Bonfire (₹500 per group)"] });
  assert.equal(t, "Hi, I'm interested in these at Hill View:\n• Honeymoon (₹4,000 per group)\n• Bonfire (₹500 per group)\n\nPlease tell me the details and add them to my stay.");
});

test("stay details are added when dates were chosen, rooms only when picked", () => {
  const withRooms = buildCatalogEnquiryText({ propertyName: "P", items: ["A"], stay: { checkIn: "12 Dec", checkOut: "14 Dec", guests: 3, rooms: ["Deluxe", "Cottage"] } });
  assert.match(withRooms, /Stay: 12 Dec to 14 Dec, 3 guests\nRooms: Deluxe, Cottage/);
  const noRooms = buildCatalogEnquiryText({ propertyName: "P", items: ["A"], stay: { checkIn: "12 Dec", checkOut: "13 Dec", guests: 1, rooms: [] } });
  assert.match(noRooms, /Stay: 12 Dec to 13 Dec, 1 guest\n/);
  assert.doesNotMatch(noRooms, /Rooms:/);
});

test("the link goes to the owner's number with the text encoded", () => {
  const l = catalogEnquiryLink("9876543210", { propertyName: "P", items: ["A"] });
  assert.ok(l.startsWith("https://wa.me/919876543210?text="));
  assert.ok(l.includes(encodeURIComponent("• A")));
});
