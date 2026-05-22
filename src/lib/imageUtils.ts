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
 *  Room image   → ≤ 150 KB  (shown at max ~400 px on mobile)
 *  Hero image   → ≤ 250 KB  (full-bleed banner, 1280 px wide cap)
 *  About image  → ≤ 180 KB  (half-width column on desktop)
 *  Logo         → ≤  20 KB  (40 px circle in header)
 *  Static map   → ≤ 120 KB  (static image, no JS SDK)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImagePreset = "room" | "hero" | "about" | "logo" | "staticMap";

interface CompressOptions {
  maxWidth: number;
  maxHeight: number;
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
  /** Compression ratio as a percentage reduction */
  savingPct: number;
}

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

/**
 * Presets are sized for *display slot* not screen resolution.
 * We apply 2× for retina but keep maxBytes tight.
 *
 * Room cards: 400 px wide max → 800 px for 2×, cap height at 600
 * Hero: full-width banner, 1280 px wide is plenty at 0.75 quality
 * About: half-column ≈ 640 px → 900 px for 2×
 * Logo: 40 px circle → 120 px for 3× retina is generous
 * Static map: 900 × 500 at 0.72 — mostly flat colours, compresses well
 */
const PRESETS: Record<ImagePreset, CompressOptions> = {
  room: {
    maxWidth: 800,
    maxHeight: 600,
    quality: 0.72,
    maxBytes: 150_000, // 150 KB
  },
  hero: {
    maxWidth: 1280,
    maxHeight: 720,
    quality: 0.75,
    maxBytes: 250_000, // 250 KB
  },
  about: {
    maxWidth: 900,
    maxHeight: 675,
    quality: 0.75,
    maxBytes: 180_000, // 180 KB
  },
  logo: {
    maxWidth: 120,
    maxHeight: 120,
    quality: 0.85,
    maxBytes: 20_000, // 20 KB
  },
  staticMap: {
    maxWidth: 900,
    maxHeight: 500,
    quality: 0.72,
    maxBytes: 120_000, // 120 KB
  },
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** 10 MB hard cap — above this a low-end Android tab will freeze */
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/**
 * Validates the file before we attempt compression.
 * Throws a user-friendly string (not an Error) so callers can show it directly.
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
// Core compression
// ---------------------------------------------------------------------------

/**
 * Draws the image onto a canvas scaled to fit within maxWidth × maxHeight,
 * then encodes as WebP at the given quality.
 */
async function encodeToWebP(
  img: HTMLImageElement,
  opts: CompressOptions
): Promise<Blob> {
  let { maxWidth, maxHeight, quality } = opts;

  // Scale down proportionally — never upscale
  let { naturalWidth: w, naturalHeight: h } = img;
  if (w > maxWidth) {
    h = Math.round((h * maxWidth) / w);
    w = maxWidth;
  }
  if (h > maxHeight) {
    w = Math.round((w * maxHeight) / h);
    h = maxHeight;
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw "Canvas 2D context unavailable.";

  ctx.drawImage(img, 0, 0, w, h);

  // First attempt at requested quality
  let blob = await canvasToBlob(canvas, quality);

  // If still over budget, retry at progressively lower quality (min 0.40)
  let attempts = 0;
  while (blob.size > opts.maxBytes && quality > 0.4 && attempts < 4) {
    quality = +(quality - 0.08).toFixed(2);
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
          reject("Canvas toBlob returned null — browser may not support WebP.");
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
    img.onerror = () => reject("Failed to load image for compression.");
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate, compress, and return a WebP File ready for Supabase Storage upload.
 *
 * @example
 * ```ts
 * import { compressImage, validateImageFile } from "@/lib/imageUtils";
 *
 * const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
 *   const file = e.target.files?.[0];
 *   if (!file) return;
 *   try {
 *     validateImageFile(file);                          // throws string on failure
 *     const { file: compressed, savingPct } = await compressImage(file, "room");
 *     console.log(`Saved ${savingPct}%`);
 *     // upload compressed to Supabase Storage
 *   } catch (err) {
 *     setError(typeof err === "string" ? err : "Compression failed.");
 *   }
 * };
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

  const outputName = file.name.replace(/\.[^.]+$/, ".webp");
  const compressed = new File([blob], outputName, { type: "image/webp" });

  const savingPct = Math.round((1 - blob.size / originalBytes) * 100);

  return {
    file: compressed,
    originalBytes,
    compressedBytes: blob.size,
    savingPct,
  };
}

/**
 * Convenience: validate then compress in one call.
 * Throws a user-friendly string on validation failure.
 */
export async function validateAndCompress(
  file: File,
  preset: ImagePreset
): Promise<CompressResult> {
  validateImageFile(file); // throws string if invalid
  return compressImage(file, preset);
}

// ---------------------------------------------------------------------------
// Formatting helpers (for UI feedback)
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
