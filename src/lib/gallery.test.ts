import test from "node:test";
import assert from "node:assert/strict";
import { instagramUrl, normalizeInstagram, thumbUrl } from "./gallery";

test("thumbnail sits next to the photo", () => {
  assert.equal(thumbUrl("https://x.supabase.co/storage/v1/object/public/hero-images/p1/gallery-1700.webp"), "https://x.supabase.co/storage/v1/object/public/hero-images/p1/gallery-1700-t.webp");
  assert.equal(thumbUrl("https://x/y/gallery-1.webp?v=2"), "https://x/y/gallery-1-t.webp?v=2");
});

test("instagram: handle, @handle or link all become the handle", () => {
  for (const v of ["hillview", "@hillview", " @hillview ", "https://www.instagram.com/hillview/", "instagram.com/hillview?igsh=abc", "https://instagram.com/hillview/reels/"]) {
    assert.equal(normalizeInstagram(v), "hillview", v);
  }
  assert.equal(normalizeInstagram("hill.view_1"), "hill.view_1");
});

test("instagram: empty is null, nonsense is invalid", () => {
  assert.equal(normalizeInstagram(""), null);
  assert.equal(normalizeInstagram(null), null);
  assert.equal(normalizeInstagram("not a handle!"), "invalid");
  assert.equal(normalizeInstagram("a".repeat(31)), "invalid");
  assert.equal(normalizeInstagram("https://facebook.com/x"), "invalid");
});

test("instagram link", () => {
  assert.equal(instagramUrl("@hillview"), "https://www.instagram.com/hillview/");
  assert.equal(instagramUrl("bad handle"), null);
  assert.equal(instagramUrl(null), null);
});
