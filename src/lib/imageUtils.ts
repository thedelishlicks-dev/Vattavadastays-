/**
 * imageUtils.ts — v4
 * Centralised image compression for VattavadaStays.
 *
 * v4 — root cause fix: replaced canvas.toBlob("image/webp") with
 * browser-image-compression, which correctly handles Safari on iOS/iPadOS.
 *
 * Root cause of previous failures:
 *   Safari cannot ENCODE WebP via canvas.toBlob — it silently falls back
 *   to PNG (lossless), producing files as large or larger than the input.
 *   Owners upload from iPads on Safari, so every previous "WebP" file in
 *   Supabase Storage was actually an uncompressed PNG renamed .webp.
 *
 * browser-image-compression:
 *   - ~10 KB gzipped, no WASM, safe on 2G
 *   - Falls back to JPEG (not PNG) when WebP encoding is unavailable
 *   - Handles HEIC/HEIF from iPhone cameras
 *   - Battle-tested across Safari, Chrome, Firefox, Samsung Internet
 *
 * Install: npm install browser-image-compression
 *
 * Target file sizes:
 *   Room      ≤ 120 KB   (displayed ~400 px wide on mobile)
 *   Hero      ≤ 220 KB   (full-width banner)
 *   About     ≤ 150 KB   (half-column)
 *   Logo      ≤  15 KB   (40 px circle)
 *   Static map ≤ 100 KB  (no JS SDK)
 */

import imageCompression from "browser-image-compression";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImagePreset = "room" | "hero" | "about" | "logo" | "staticMap";

export interface CompressResult {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  /** Saving as a percentage. 0 when usedOriginal is true. */
  savingPct: number;
  /** true when the original was returned because compression didn't help */
  usedOriginal: boolean;
  /** true when output landed at or under the target maxSizeMB */
  hitBudget: boolean;
}

// ---------------------------------------------------------------------------
// Presets — translated to browser-image-compression options
// ---------------------------------------------------------------------------

/**
 * maxSizeMB: hard ceiling passed to the library. It will keep retrying
 *   at lower quality until the output is under this size.
 * maxWidthOrHeight: longest edge cap. The library handles portrait/landscape.
 * initialQuality: starting encoder quality 0–1.
 * useWebWorker: true keeps the UI thread unblocked during compression.
 *   Critical on low-end Android devices where the main thread is already slow.
 */
const PRESET_OPTIONS: Record<
  ImagePreset,
  Parameters<typeof imageCompression>[1]
> = {
  room: {
    maxSizeMB: 0.12,         // 120 KB
    maxWidthOrHeight: 800,
    initialQuality: 0.70,
    useWebWorker: true,
  },
  hero: {
    maxSizeMB: 0.22,         // 220 KB
    maxWidthOrHeight: 1280,
    initialQuality: 0.73,
    useWebWorker: true,
  },
  about: {
    maxSizeMB: 0.15,         // 150 KB
    maxWidthOrHeight: 900,
    initialQuality: 0.73,
    useWebWorker: true,
  },
  logo: {
    maxSizeMB: 0.015,        // 15 KB
    maxWidthOrHeight: 120,
    initialQuality: 0.82,
    useWebWorker: true,
  },
  staticMap: {
    maxSizeMB: 0.10,         // 100 KB
    maxWidthOrHeight: 900,
    initialQuality: 0.70,
    useWebWorker: true,
  },
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB

const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/**
 * Throws a user-friendly string on failure — callers display it directly.
 */
export function validateImageFile(file: File): void {
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    throw `Unsupported file type "${file.type}". Please upload a JPG, PNG, or WebP image.`;
  }
  if (file.size > MAX_INPUT_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw `Image is too large (${mb} MB). Please use an image under 10 MB.`;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate then compress a File using the named preset.
 *
 * Uses browser-image-compression which:
 *   1. Resizes to maxWidthOrHeight (longest edge, orientation-aware)
 *   2. Encodes as WebP where supported (Chrome, Firefox, Edge)
 *   3. Falls back to JPEG (NOT PNG) on Safari — so iOS/iPadOS owners
 *      get correct compression regardless of browser
 *   4. Keeps retrying at lower quality until maxSizeMB is achieved
 *
 * If the compressed output is larger than the original (already-optimised
 * images), the original file is returned unchanged.
 *
 * @throws string — user-friendly validation error, show directly in UI
 *
 * @example
 * ```ts
 * try {
 *   const result = await validateAndCompress(file, "room");
 *   // upload result.file to Supabase Storage
 *   setProgress(compressionSummary(result));
 * } catch (err) {
 *   setError(typeof err === "string" ? err : "Compression failed.");
 * }
 * ```
 */
export async function validateAndCompress(
  file: File,
  preset: ImagePreset
): Promise<CompressResult> {
  validateImageFile(file);

  const originalBytes = file.size;
  const opts          = PRESET_OPTIONS[preset];
  const maxBytes      = (opts.maxSizeMB as number) * 1024 * 1024;

  let compressed: File;
  try {
    compressed = await imageCompression(file, opts);
  } catch (err: unknown) {
    // Library throws on truly unrecoverable errors (corrupt file, etc.)
    throw err instanceof Error ? err.message : "Image compression failed.";
  }

  // If compression made it larger (already-optimised source), return original
  if (compressed.size >= originalBytes) {
    return {
      file,
      originalBytes,
      compressedBytes: originalBytes,
      savingPct: 0,
      usedOriginal: true,
      hitBudget: originalBytes <= maxBytes,
    };
  }

  const savingPct = Math.round((1 - compressed.size / originalBytes) * 100);

  return {
    file: compressed,
    originalBytes,
    compressedBytes: compressed.size,
    savingPct,
    usedOriginal: false,
    hitBudget: compressed.size <= maxBytes,
  };
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Human-readable summary for the upload progress widget.
 *
 * Examples:
 *   "Already optimised (498 KB) — uploaded as-is"
 *   "815 KB → 98 KB  −88%"
 *   "815 KB → 143 KB  −82%  (high-detail image)"
 */
export function compressionSummary(result: CompressResult): string {
  if (result.usedOriginal) {
    return `Already optimised (${formatBytes(result.originalBytes)}) — uploaded as-is`;
  }
  const base = `${formatBytes(result.originalBytes)} → ${formatBytes(result.compressedBytes)}  −${result.savingPct}%`;
  return result.hitBudget ? base : `${base}  (high-detail image)`;
}
