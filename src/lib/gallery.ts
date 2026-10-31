// src/lib/gallery.ts
//
// Property gallery and Instagram link. Pure helpers.
//
// Every gallery photo is uploaded twice: a small thumbnail for the grid (loads fast on a weak
// connection) and a bigger photo that only loads when a guest taps to enlarge. The thumbnail
// sits next to the photo with "-t" added before ".webp", so only the full URL is stored.

export const MAX_GALLERY_PHOTOS = 12;
export const MAX_ROOM_PHOTOS = 6;

export function thumbUrl(fullUrl: string): string {
  return fullUrl.replace(/\.webp(\?.*)?$/i, "-t.webp$1");
}

export function thumbPath(fullPath: string): string {
  return thumbUrl(fullPath);
}

/**
 * Owners type a handle, an @handle or a whole Instagram link. Store only the handle.
 * Returns null for empty input and "invalid" for anything that is not a valid handle.
 */
export function normalizeInstagram(input: string | null | undefined): string | null | "invalid" {
  let v = (input ?? "").trim();
  if (!v) return null;
  v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^instagram\.com\//i, "");
  v = v.split(/[/?#]/)[0].replace(/^@/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(v) ? v : "invalid";
}

export function instagramUrl(handle: string | null | undefined): string | null {
  const n = normalizeInstagram(handle);
  return n && n !== "invalid" ? `https://www.instagram.com/${n}/` : null;
}
