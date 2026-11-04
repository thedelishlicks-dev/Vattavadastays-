import test from "node:test";
import assert from "node:assert/strict";
import { appleMapsUrl, directionsUrl, googleMapsPinUrl, hasCoordinates, splitCoordinatePair, validateCoordinates } from "./location";

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

test("directions link: exact spot with both numbers, name search with one or none", () => {
  assert.equal(directionsUrl({ lat: 10.12, lng: 77.15, name: "Hill View", area: "Vattavada" }), "https://www.google.com/maps/search/?api=1&query=10.12%2C77.15");
  const one = directionsUrl({ lat: 10.12, lng: null, name: "Hill View", area: "Vattavada" });
  assert.equal(one, "https://www.google.com/maps/search/?api=1&query=Hill%20View%20Vattavada%20Kerala");
  assert.equal(directionsUrl({ lat: null, lng: null, name: "Hill View" }), "https://www.google.com/maps/search/?api=1&query=Hill%20View%20Kerala");
  assert.ok(!directionsUrl({ lat: 10.12, lng: undefined, name: "X" }).includes("null"));
  assert.ok(!directionsUrl({ lat: 10.12, lng: undefined, name: "X" }).includes("undefined"));
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

test("a link going into message text has no raw comma, so no messaging app can cut it after the first number", () => {
  // The Android SMS app ended the link at the comma: "...?q=10.2167" was blue, ",77.2" was plain text.
  const url = directionsUrl({ lat: 10.2167, lng: 77.2, name: "Mist Valley Homestay" });
  assert.equal(url, "https://www.google.com/maps/search/?api=1&query=10.2167%2C77.2");
  assert.ok(!url.includes(","));
  assert.ok(!/\s/.test(url));
  assert.ok(!googleMapsPinUrl(9.5, 76.3).includes(","));
  // Even the name fallback has no comma or space, whatever the property is called.
  assert.ok(!/[,\s]/.test(directionsUrl({ lat: null, lng: null, name: "Mist Valley, Homestay", area: "Vattavada" })));
});
