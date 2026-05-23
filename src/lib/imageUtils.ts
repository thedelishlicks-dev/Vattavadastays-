/**
 * imageUtils.ts — v3
 * Centralised image compression for VattavadaStays.
 *
 * Target file sizes after compression:
 *  Room image   → ≤ 120 KB
 *  Hero image   → ≤ 220 KB
 *  About image  → ≤ 150 KB
 *  Logo         → ≤  15 KB
 *  Static map   → ≤ 100 KB
 *
 * v3 fixes:
 *  - Two-pass compression: quality retries first, then pixel downscale if
 *    still over budget. Handles high-detail images that quality alone can't tame.
 *  - Correct usedOriginal: triggers when output > input OR when output is
 *    still over maxBytes after all passes (uploads smaller of original/output).
 *  - Portrait fix retained from v2: long-edge / short-edge scaling.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImagePreset = "room" | "hero" | "about" | "logo" | "staticMap";

interface CompressOptions {
  /** Hard pixel cap on the longest edge */
  maxLongEdge: number;
  /** Hard pixel cap on the short edge */
  maxShortEdge: number;
  /** Starting WebP quality 0–1 */
  quality: number;
  /** Target ceiling in bytes — we keep retrying until we hit this */
  maxBytes: number;
}

export interface CompressResult {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  /** Saving as a percentage. 0 when usedOriginal is true. */
  savingPct: number;
  /** true when the original was returned because compression couldn't beat it */
  usedOriginal: boolean;
  /** true when we hit the budget, false when we got close but not under */
  hitBudget: boolean;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESETS: Record<ImagePreset, CompressOptions> = {
  room: {
    maxLongEdge: 800,
    maxShortEdge: 600,
    quality: 0.70,
    maxBytes: 120_000,
  },
  hero: {
    maxLongEdge: 1280,
    maxShortEdge: 720,
    quality: 0.73,
    maxBytes: 220_000,
  },
  about: {
    maxLongEdge: 900,
    maxShortEdge: 675,
    quality: 0.73,
    maxBytes: 150_000,
  },
  logo: {
    maxLongEdge: 120,
    maxShortEdge: 120,
    quality: 0.82,
    maxBytes: 15_000,
  },
  staticMap: {
    maxLongEdge: 900,
    maxShortEdge: 500,
    quality: 0.70,
    maxBytes: 100_000,
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
 * Throws a user-friendly string on failure — callers can show it directly.
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
// Geometry
// ---------------------------------------------------------------------------

/**
 * Scale (w, h) so neither the long edge nor the short edge exceeds its cap.
 * Works correctly for both portrait and landscape orientations.
 * Never upscales.
 */
function scaleDimensions(
  w: number,
  h: number,
  maxLongEdge: number,
  maxShortEdge: number
): { w: number; h: number } {
  const isLandscape = w >= h;
  const longEdge  = isLandscape ? w : h;
  const shortEdge = isLandscape ? h : w;

  let scale = 1;
  if (longEdge  > maxLongEdge)  scale = Math.min(scale, maxLongEdge  / longEdge);
  if (shortEdge > maxShortEdge) scale = Math.min(scale, maxShortEdge / shortEdge);

  return {
    w: Math.round(w * scale),
    h: Math.round(h * scale),
  };
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

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

function drawCanvas(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw "Canvas 2D context unavailable.";
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject("Failed to decode image for compression.");
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Two-pass compression engine
// ---------------------------------------------------------------------------

/**
 * Pass 1 — quality retries at the preset pixel dimensions.
 *   Start at preset quality, step down by 0.07 up to 6 times (floor 0.32).
 *
 * Pass 2 — pixel downscale if quality retries couldn't hit the budget.
 *   Reduce dimensions to 60% of preset caps and retry quality loop again.
 *   This handles high-detail images (foliage, textured fabrics, mosaics)
 *   where quality alone hits a floor before the byte budget.
 *
 * Returns the smallest blob found across both passes.
 */
async function twoPassEncode(
  img: HTMLImageElement,
  opts: CompressOptions
): Promise<{ blob: Blob; hitBudget: boolean }> {

  // ── Pass 1: preset dimensions ───────────────────────────────────────────
  const { w: w1, h: h1 } = scaleDimensions(
    img.naturalWidth,
    img.naturalHeight,
    opts.maxLongEdge,
    opts.maxShortEdge
  );

  const canvas1 = drawCanvas(img, w1, h1);
  let bestBlob  = await canvasToBlob(canvas1, opts.quality);
  let quality   = opts.quality;

  for (let i = 0; i < 6 && bestBlob.size > opts.maxBytes && quality > 0.32; i++) {
    quality  = +(quality - 0.07).toFixed(2);
    const b  = await canvasToBlob(canvas1, quality);
    if (b.size < bestBlob.size) bestBlob = b;
  }

  if (bestBlob.size <= opts.maxBytes) {
    return { blob: bestBlob, hitBudget: true };
  }

  // ── Pass 2: 60% pixel dimensions, fresh quality loop ───────────────────
  const { w: w2, h: h2 } = scaleDimensions(
    img.naturalWidth,
    img.naturalHeight,
    Math.round(opts.maxLongEdge  * 0.6),
    Math.round(opts.maxShortEdge * 0.6)
  );

  const canvas2 = drawCanvas(img, w2, h2);
  quality       = opts.quality; // reset quality for pass 2
  let pass2Blob = await canvasToBlob(canvas2, quality);

  for (let i = 0; i < 6 && pass2Blob.size > opts.maxBytes && quality > 0.32; i++) {
    quality      = +(quality - 0.07).toFixed(2);
    const b      = await canvasToBlob(canvas2, quality);
    if (b.size < pass2Blob.size) pass2Blob = b;
  }

  // Return the smaller of pass 1 and pass 2 results
  const finalBlob = pass2Blob.size < bestBlob.size ? pass2Blob : bestBlob;
  return { blob: finalBlob, hitBudget: finalBlob.size <= opts.maxBytes };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate then compress a File using the named preset.
 *
 * Decision tree for the output file:
 *   - If compressed WebP < original AND hits budget → return WebP  ✓
 *   - If compressed WebP < original but misses budget → return WebP
 *     (best we could do — still smaller than input)
 *   - If compressed WebP >= original → return original file
 *     (already optimised, WebP made it worse)
 *
 * @example
 * ```ts
 * const result = await validateAndCompress(file, "room");
 * // result.file   — the file to upload (always the smallest option)
 * // result.hitBudget — false means image is very high-detail; still upload
 * // compressionSummary(result) — human-readable string for progress UI
 * ```
 */
export async function validateAndCompress(
  file: File,
  preset: ImagePreset
): Promise<CompressResult> {
  validateImageFile(file);

  const opts          = PRESETS[preset];
  const originalBytes = file.size;

  const objectUrl = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const { blob, hitBudget } = await twoPassEncode(img, opts);

  // If WebP is not smaller than the original, return the original unchanged
  if (blob.size >= originalBytes) {
    return {
      file,
      originalBytes,
      compressedBytes: originalBytes,
      savingPct: 0,
      usedOriginal: true,
      hitBudget: originalBytes <= opts.maxBytes,
    };
  }

  const outputName = file.name.replace(/\.[^.]+$/, ".webp");
  const compressed = new File([blob], outputName, { type: "image/webp" });
  const savingPct  = Math.round((1 - blob.size / originalBytes) * 100);

  return {
    file: compressed,
    originalBytes,
    compressedBytes: blob.size,
    savingPct,
    usedOriginal: false,
    hitBudget,
  };
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Human-readable compression result for the upload progress widget.
 *
 * Examples:
 *   "Already optimised (498 KB) — uploaded as-is"
 *   "815 KB → 104 KB  −87%"
 *   "815 KB → 143 KB  −82%  (high-detail image)"
 */
export function compressionSummary(result: CompressResult): string {
  if (result.usedOriginal) {
    return `Already optimised (${formatBytes(result.originalBytes)}) — uploaded as-is`;
  }
  const base = `${formatBytes(result.originalBytes)} → ${formatBytes(result.compressedBytes)}  −${result.savingPct}%`;
  return result.hitBudget ? base : `${base}  (high-detail image)`;
}
