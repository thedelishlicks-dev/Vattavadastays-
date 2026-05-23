/**
 * imageUtils.ts
 * Centralised image compression for VattavadaStays.
 *
 * Design constraints (from PRD):
 *  - Guest page must load on 2G / BSNL weak signal
 *  - Images are the #1 page-weight contributor
 *  - All output is WebP — best compression at target quality
 *
 * Target file sizes after compression:
 *  Room image   → ≤ 120 KB  (shown at max ~400 px on mobile)
 *  Hero image   → ≤ 220 KB  (full-bleed banner, 1280 px wide cap)
 *  About image  → ≤ 150 KB  (half-width column on desktop)
 *  Logo         → ≤  15 KB  (40 px circle in header)
 *  Static map   → ≤ 100 KB  (static image, no JS SDK)
 *
 * Three bugs fixed vs v1:
 *  1. Portrait images weren't resized — scaling now checks the LONGEST side
 *     first so a 768×1408 image gets capped correctly by height, not skipped.
 *  2. Output could be larger than input for already-compressed JPEGs —
 *     we now return the original file if WebP output is bigger.
 *  3. maxBytes budget was too loose — tightened to reflect real display slots.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImagePreset = "room" | "hero" | "about" | "logo" | "staticMap";

interface CompressOptions {
  /** Hard pixel cap on the longest edge — handles portrait and landscape equally */
  maxLongEdge: number;
  /** Hard pixel cap on the short edge — prevents excessively tall/wide slivers */
  maxShortEdge: number;
  /** WebP encoder quality 0–1. Lower = smaller file, more artefacts. */
  quality: number;
  /** Hard cap in bytes. Compression retries at lower quality if exceeded. */
  maxBytes: number;
}

export interface CompressResult {
  file: File;
  /** Original file size in bytes */
  originalBytes: number;
  /** Compressed file size in bytes */
  compressedBytes: number;
  /** Saving as a percentage. Negative means output was larger (edge case). */
  savingPct: number;
  /** true when we fell back to the original because WebP was larger */
  usedOriginal: boolean;
}

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

/**
 * Presets use maxLongEdge / maxShortEdge instead of maxWidth / maxHeight.
 * This way a portrait photo (tall) and a landscape photo (wide) both get
 * capped correctly regardless of orientation.
 *
 * Room cards:    displayed ~400 px wide, 300 px tall → long edge 800 px @ 2×
 * Hero:          full-width banner → long edge 1280 px @ 2× (landscape assumed)
 * About:         half-column → long edge 900 px @ 2×
 * Logo:          40 px circle → long edge 120 px @ 3× retina
 * Static map:    landscape screenshot → long edge 900 px
 */
const PRESETS: Record<ImagePreset, CompressOptions> = {
  room: {
    maxLongEdge: 800,
    maxShortEdge: 600,
    quality: 0.70,
    maxBytes: 120_000, // 120 KB
  },
  hero: {
    maxLongEdge: 1280,
    maxShortEdge: 720,
    quality: 0.73,
    maxBytes: 220_000, // 220 KB
  },
  about: {
    maxLongEdge: 900,
    maxShortEdge: 675,
    quality: 0.73,
    maxBytes: 150_000, // 150 KB
  },
  logo: {
    maxLongEdge: 120,
    maxShortEdge: 120,
    quality: 0.82,
    maxBytes: 15_000, // 15 KB
  },
  staticMap: {
    maxLongEdge: 900,
    maxShortEdge: 500,
    quality: 0.70,
    maxBytes: 100_000, // 100 KB
  },
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** 10 MB hard cap — above this a low-end Android will freeze during compression */
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/**
 * Validates the file before we attempt compression.
 * Throws a user-friendly string (not an Error) so callers can display it directly.
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
// Core resize + encode
// ---------------------------------------------------------------------------

/**
 * Scales (w, h) so that:
 *   - the long edge does not exceed maxLongEdge
 *   - the short edge does not exceed maxShortEdge
 *   - aspect ratio is preserved
 *   - the image is never upscaled
 *
 * FIX vs v1: previous code checked width first, so a portrait image
 * (width < maxWidth, height >> maxHeight) would skip width scaling and
 * only shrink by the height check — resulting in one pass that still left
 * the canvas too large. Now we find the constraining dimension first.
 */
function scaleDimensions(
  w: number,
  h: number,
  opts: CompressOptions
): { w: number; h: number } {
  const isLandscape = w >= h;

  const longEdge = isLandscape ? w : h;
  const shortEdge = isLandscape ? h : w;

  let scale = 1;

  // Which constraint binds first?
  if (longEdge > opts.maxLongEdge) {
    scale = Math.min(scale, opts.maxLongEdge / longEdge);
  }
  if (shortEdge > opts.maxShortEdge) {
    scale = Math.min(scale, opts.maxShortEdge / shortEdge);
  }

  // Never upscale
  scale = Math.min(scale, 1);

  return {
    w: Math.round(w * scale),
    h: Math.round(h * scale),
  };
}

async function encodeToWebP(
  img: HTMLImageElement,
  opts: CompressOptions
): Promise<Blob> {
  const { w, h } = scaleDimensions(img.naturalWidth, img.naturalHeight, opts);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw "Canvas 2D context unavailable.";

  ctx.drawImage(img, 0, 0, w, h);

  let quality = opts.quality;
  let blob = await canvasToBlob(canvas, quality);

  // Retry at lower quality until we hit the byte budget (floor: 0.38)
  let attempts = 0;
  while (blob.size > opts.maxBytes && quality > 0.38 && attempts < 5) {
    quality = +(quality - 0.07).toFixed(2);
    blob = await canvasToBlob(canvas, quality);
    attempts++;
  }

  return blob;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject("Canvas toBlob returned null — browser may not support WebP encoding.");
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject("Failed to decode image for compression.");
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compress a File using the named preset.
 *
 * FIX vs v1: if the WebP output ends up LARGER than the input (can happen
 * with already-optimised JPEGs like a Pinterest-saved photo), we return the
 * original file unchanged rather than making things worse.
 *
 * @example
 * ```ts
 * import { validateAndCompress, formatBytes } from "@/lib/imageUtils";
 *
 * try {
 *   const { file, originalBytes, compressedBytes, savingPct, usedOriginal } =
 *     await validateAndCompress(pickedFile, "room");
 *
 *   if (usedOriginal) {
 *     console.log("Already optimised — uploading original");
 *   } else {
 *     console.log(`Saved ${savingPct}% (${formatBytes(originalBytes)} → ${formatBytes(compressedBytes)})`);
 *   }
 *   // upload `file` to Supabase Storage
 * } catch (err) {
 *   setError(typeof err === "string" ? err : "Compression failed.");
 * }
 * ```
 */
export async function compressImage(
  file: File,
  preset: ImagePreset
): Promise<CompressResult> {
  const opts = PRESETS[preset];
  const originalBytes = file.size;

  const objectUrl = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const blob = await encodeToWebP(img, opts);

  // FIX: if WebP is larger than the original, return the original file.
  // This prevents already-compressed JPEGs from being made worse.
  if (blob.size >= originalBytes) {
    return {
      file,
      originalBytes,
      compressedBytes: originalBytes,
      savingPct: 0,
      usedOriginal: true,
    };
  }

  const outputName = file.name.replace(/\.[^.]+$/, ".webp");
  const compressed = new File([blob], outputName, { type: "image/webp" });
  const savingPct = Math.round((1 - blob.size / originalBytes) * 100);

  return {
    file: compressed,
    originalBytes,
    compressedBytes: blob.size,
    savingPct,
    usedOriginal: false,
  };
}

/**
 * Convenience wrapper: validate then compress in one call.
 * Throws a user-friendly string on validation failure.
 */
export async function validateAndCompress(
  file: File,
  preset: ImagePreset
): Promise<CompressResult> {
  validateImageFile(file);
  return compressImage(file, preset);
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Returns a human-readable summary of the compression result for display
 * in the upload progress UI.
 *
 * Examples:
 *   "Already optimised (498 KB) — uploaded as-is"
 *   "498 KB → 87 KB  −83%"
 */
export function compressionSummary(result: CompressResult): string {
  if (result.usedOriginal) {
    return `Already optimised (${formatBytes(result.originalBytes)}) — uploaded as-is`;
  }
  return `${formatBytes(result.originalBytes)} → ${formatBytes(result.compressedBytes)}  −${result.savingPct}%`;
}
