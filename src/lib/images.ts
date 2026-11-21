const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i;

function isLikelyImageFile(file: File): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  if (!file.type && IMAGE_EXT_RE.test(file.name)) return true;
  return false;
}

interface LoadedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

async function loadImageSource(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTMLImageElement below
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          "Could not read this image format. Please try a JPEG, PNG, or WebP photo."
        )
      );
    };
    img.src = url;
  });
}

function renderCanvasToJpeg(
  canvas: HTMLCanvasElement,
  qualities: number[],
  maxBytes: number
): string {
  let output = "";
  for (const q of qualities) {
    output = canvas.toDataURL("image/jpeg", q);
    if (output.length <= maxBytes) {
      return output;
    }
  }
  return output;
}

/**
 * Center-crops an image file to a 256x256 square JPEG data URL (~15-35 KB)
 * suitable for storing as a member profile picture.
 */
export async function compressAvatarImage(file: File): Promise<string> {
  if (!isLikelyImageFile(file)) {
    throw new Error("Please select an image file (JPEG, PNG, or WebP).");
  }

  const loaded = await loadImageSource(file);
  try {
    const side = Math.min(loaded.width, loaded.height);
    if (side <= 0) {
      throw new Error("That image appears to be empty or corrupted.");
    }
    const sx = Math.floor((loaded.width - side) / 2);
    const sy = Math.floor((loaded.height - side) / 2);
    const targetSize = 256;

    const canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Image processing is unavailable in this browser.");
    }

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, targetSize, targetSize);
    ctx.drawImage(loaded.source, sx, sy, side, side, 0, 0, targetSize, targetSize);

    const dataUrl = renderCanvasToJpeg(
      canvas,
      [0.84, 0.72, 0.6, 0.45],
      180 * 1024
    );
    if (!dataUrl.startsWith("data:image/")) {
      throw new Error("Failed to process image. Please try another photo.");
    }
    return dataUrl;
  } finally {
    loaded.cleanup();
  }
}

/**
 * Resizes and compresses a Family Wall photo while preserving aspect ratio.
 * Targets <= 450 KB per photo so multi-photo posts reliably save within
 * serverless request payload limits.
 */
export async function compressWallPhoto(file: File): Promise<string> {
  if (!isLikelyImageFile(file)) {
    throw new Error("Please select an image file (JPEG, PNG, or WebP).");
  }

  const loaded = await loadImageSource(file);
  try {
    if (loaded.width <= 0 || loaded.height <= 0) {
      throw new Error("That image appears to be empty or corrupted.");
    }

    const drawScaled = (maxEdge: number, qualities: number[], maxBytes: number) => {
      const scale = Math.min(1, maxEdge / Math.max(loaded.width, loaded.height));
      const width = Math.max(1, Math.round(loaded.width * scale));
      const height = Math.max(1, Math.round(loaded.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Image processing is unavailable in this browser.");
      }

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(loaded.source, 0, 0, width, height);
      return renderCanvasToJpeg(canvas, qualities, maxBytes);
    };

    const targetMaxBytes = 450 * 1024;
    let dataUrl = drawScaled(1280, [0.82, 0.72, 0.6, 0.48], targetMaxBytes);

    if (dataUrl.length > targetMaxBytes) {
      dataUrl = drawScaled(960, [0.68, 0.56, 0.44], targetMaxBytes);
    }

    if (!dataUrl.startsWith("data:image/")) {
      throw new Error("Failed to process photo. Please try another image.");
    }
    return dataUrl;
  } finally {
    loaded.cleanup();
  }
}
