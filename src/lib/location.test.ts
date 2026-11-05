import test from "node:test";
import assert from "node:assert/strict";
import { appleMapsUrl, directionsShortLink, directionsUrl, hasCoordinates, splitCoordinatePair, validateCoordinates } from "./location";

test("coordinates count only as a pair of real numbers", () => {
  assert.equal(hasCoordinates(10.12, 77.15), true);
  assert.equal(hasCoordinates("10.12", "77.15"), true);
  assert.equal(hasCoordinates(0, 0), true); // zero is a real place, not "missing"
  assert.equal(hasCoordinates(10.12, null), false);
  assert.equal(hasCoordinates(null, 77.15), false);
  assert.equal(hasCoordinates(10.12, undefined), false);
  assert.equal(hasCoordinates(10.12, ""), false);
  assert.equal(hasCoordinates(NaN, 77), false);
  assert.equal(hasCoordinates(95, 77), false);
});

test("directions link: route to the pin, or to the name and area when there is no pin or the owner chose the listing", () => {
  assert.equal(directionsUrl({ lat: 10.12, lng: 77.15, name: "Hill View", area: "Vattavada" }), "https://www.google.com/maps/dir/?api=1&destination=10.12%2C77.15&travelmode=driving");
  const one = directionsUrl({ lat: 10.12, lng: null, name: "Hill View", area: "Vattavada" });
  assert.equal(one, "https://www.google.com/maps/dir/?api=1&destination=Hill%20View%2C%20Vattavada%2C%20Kerala&travelmode=driving");
  assert.equal(directionsUrl({ lat: null, lng: null, name: "Hill View" }), "https://www.google.com/maps/dir/?api=1&destination=Hill%20View%2C%20Kerala&travelmode=driving");
  assert.equal(directionsUrl({ lat: 10.12, lng: 77.15, name: "Hill View", area: "Vattavada", byName: true }), "https://www.google.com/maps/dir/?api=1&destination=Hill%20View%2C%20Vattavada%2C%20Kerala&travelmode=driving");
  assert.ok(!directionsUrl({ lat: 10.12, lng: undefined, name: "X" }).includes("undefined"));
  assert.ok(!directionsUrl({ lat: 10.12, lng: undefined, name: "X" }).includes("null"));
});

test("no starting point is given, so Google starts the route where the person stands", () => {
  assert.ok(!/[?&]origin=/.test(directionsUrl({ lat: 10.12, lng: 77.15, name: "X" })));
});

test("the link that goes into message text is short and has no & , # % or space", () => {
  // The Android SMS app ended a link at a comma; a Xiaomi SMS app ended the WHOLE message at the first &.
  const live = directionsShortLink("mistvalley", { hostname: "mistvalley.stayidom.in", origin: "https://mistvalley.stayidom.in" });
  assert.equal(live, "https://mistvalley.stayidom.in/api/directions");
  assert.equal(directionsShortLink("mistvalley"), "https://mistvalley.stayidom.in/api/directions");
  const preview = directionsShortLink("mistvalley", { hostname: "app-git-dev.vercel.app", origin: "https://app-git-dev.vercel.app" });
  assert.equal(preview, "https://app-git-dev.vercel.app/api/directions?p=mistvalley");
  for (const l of [live, preview]) assert.ok(!/[&,#%\s]/.test(l), l);
});

test("Apple Maps needs both numbers", () => {
  assert.equal(appleMapsUrl({ lat: 10.12, lng: null, name: "Hill View" }), null);
  assert.equal(appleMapsUrl({ lat: 10.12, lng: 77.15, name: "Hill View" }), "https://maps.apple.com/?ll=10.12,77.15&q=Hill%20View");
});

test("a pair pasted from Google Maps is split into both numbers", () => {
  assert.deepEqual(splitCoordinatePair("10.0889, 77.0595"), { lat: "10.0889", lng: "77.0595" });
  assert.deepEqual(splitCoordinatePair(" 10.0889,77.0595 "), { lat: "10.0889", lng: "77.0595" });
  assert.deepEqual(splitCoordinatePair("10.0889 77.0595"), { lat: "10.0889", lng: "77.0595" });
  assert.deepEqual(splitCoordinatePair("-8.5, 115.2"), { lat: "-8.5", lng: "115.2" });
  assert.equal(splitCoordinatePair("10.0889"), null);
  assert.equal(splitCoordinatePair("10.0889, abc"), null);
});

test("settings: both or neither", () => {
  assert.deepEqual(validateCoordinates("", ""), { ok: true, lat: null, lng: null });
  assert.deepEqual(validateCoordinates(" 10.12 ", "77.15"), { ok: true, lat: 10.12, lng: 77.15 });
  for (const [a, b] of [["10.12", ""], ["", "77.15"], ["10.12", "   "]]) {
    const r = validateCoordinates(a, b);
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /both/i);
  }
  assert.equal(validateCoordinates("abc", "77").ok, false);
  assert.equal(validateCoordinates("91", "77").ok, false);
  assert.equal(validateCoordinates("10", "181").ok, false);
});
