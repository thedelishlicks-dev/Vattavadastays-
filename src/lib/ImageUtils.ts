/**
 * Image compression utility for 2G connections.
 * Compresses images to WebP format before upload.
 */

type CompressOptions = {
  maxWidthPx: number;
  maxHeightPx: number;
  qualityPercent: number; // 0–1
};

const ROOM_OPTIONS: CompressOptions = {
  maxWidthPx: 1200,
  maxHeightPx: 900,
  qualityPercent: 0.75,
};

const HERO_OPTIONS: CompressOptions = {
  maxWidthPx: 1920,
  maxHeightPx: 1080,
  qualityPercent: 0.80,
};

export async function compressImage(
  file: File,
  type: "room" | "hero"
): Promise<File> {
  const options = type === "room" ? ROOM_OPTIONS : HERO_OPTIONS;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img;
      if (width > options.maxWidthPx) {
        height = Math.round((height * options.maxWidthPx) / width);
        width = options.maxWidthPx;
      }
      if (height > options.maxHeightPx) {
        width = Math.round((width * options.maxHeightPx) / height);
        height = options.maxHeightPx;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Compression failed"));
            return;
          }
          const compressed = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, ".webp"),
            { type: "image/webp" }
          );
          resolve(compressed);
        },
        "image/webp",
        options.qualityPercent
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}
