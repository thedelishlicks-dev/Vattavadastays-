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
 *  Room image   → ≤ 150 KB
 *  Hero image   → ≤ 250 KB
 *  About image  → ≤ 180 KB
 *  Logo         → ≤  20 KB
 *  Static map   → ≤ 120 KB
 */

export type ImagePreset = "room" | "hero" | "about" | "logo" | "staticMap";

interface CompressOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  maxBytes: number;
}

export interface CompressResult {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  savingPct: number;
}

const PRESETS: Record<ImagePreset, CompressOptions> = {
  room: {
    maxWidth: 800,
    maxHeight: 600,
    quality: 0.72,
    maxBytes: 150_000,
  },
  hero: {
    maxWidth: 1280,
    maxHeight: 720,
    quality: 0.75,
    maxBytes: 250_000,
  },
  about: {
    maxWidth: 900,
    maxHeight: 675,
    quality: 0.75,
    maxBytes: 180_000,
  },
  logo: {
    maxWidth: 120,
    maxHeight: 120,
    quality: 0.85,
    maxBytes: 20_000,
  },
  staticMap: {
    maxWidth: 900,
    maxHeight: 500,
    quality: 0.72,
    maxBytes: 120_000,
  },
};

/** 10 MB hard cap on input */
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export function validateImageFile(file: File): void {
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    throw `Unsupported file type "${file.type}". Please upload a JPG, PNG, or WebP image.`;
  }
  if (file.size > MAX_INPUT_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw `Image is too large (${mb} MB). Please use an image under 10 MB.`;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<<Blob> {
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

function loadImage(src: string): Promise<<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject("Failed to load image for compression.");
    img.src = src;
  });
}

/**
 * Core encoder: fits image into maxWidth×maxHeight, then encodes as WebP.
 * If quality reduction alone can't meet maxBytes, scales canvas down
 * progressively (100% → 75% → 50%) until it fits. Hard-rejects if
 * even 50% dimensions at quality 0.35 exceed the cap.
 */
async function encodeToWebP(
  img: HTMLImageElement,
  opts: CompressOptions
): Promise<<Blob> {
  const { maxWidth, maxHeight, quality, maxBytes } = opts;

  // 1. Fit original into target box (never upscale)
  let baseW = img.naturalWidth;
  let baseH = img.naturalHeight;
  if (baseW > maxWidth) {
    baseH = Math.round((baseH * maxWidth) / baseW);
    baseW = maxWidth;
  }
  if (baseH > maxHeight) {
    baseW = Math.round((baseW * maxHeight) / baseH);
    baseH = maxHeight;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw "Canvas 2D context unavailable.";

  // 2. Try dimension scales: 100%, 75%, 50%
  const scales = [1, 0.75, 0.5];
  for (const scale of scales) {
    const w = Math.max(1, Math.round(baseW * scale));
    const h = Math.max(1, Math.round(baseH * scale));

    canvas.width = w;
    canvas.height = h;
    // Clear canvas (in case of transparency/resize artifacts)
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    let q = quality;
    let attempts = 0;

    while (q >= 0.35 && attempts < 6) {
      const blob = await canvasToBlob(canvas, q);
      if (blob.size <= maxBytes) {
        return blob;
      }
      q = Math.max(0.35, +(q - 0.06).toFixed(2));
      attempts++;
    }
    // If we get here, even quality 0.35 at this scale is too big → try smaller scale
  }

  throw `Could not compress below ${formatBytes(maxBytes)}. The image is too complex. Try a smaller original or lower-resolution photo.`;
}

export async function compressImage(
  file: File,
  preset: ImagePreset
): Promise<<CompressResult> {
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

  // Hard safety check — should never trigger if encodeToWebP is working
  if (blob.size > opts.maxBytes) {
    throw `Compression failed: output ${formatBytes(blob.size)} exceeds limit ${formatBytes(opts.maxBytes)}.`;
  }

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

export async function validateAndCompress(
  file: File,
  preset: ImagePreset
): Promise<<CompressResult> {
  validateImageFile(file);
  return compressImage(file, preset);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
