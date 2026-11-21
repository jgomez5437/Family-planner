const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i;

export interface CropRect {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

export type AspectPresetKey = "4:3" | "1:1" | "16:9" | "original";

export interface ImageTransformState {
  zoom: number;
  panX: number;
  panY: number;
  aspectKey?: AspectPresetKey;
}

export function isLikelyImageFile(file: File): boolean {
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

async function loadImageSource(input: File | string): Promise<LoadedImage> {
  if (input instanceof File && typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(input);
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
    const isFile = input instanceof File;
    const url = isFile ? URL.createObjectURL(input) : input;
    const img = new Image();
    if (!isFile && /^https?:\/\//i.test(url)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => {
          if (isFile) URL.revokeObjectURL(url);
        },
      });
    };
    img.onerror = () => {
      if (isFile) URL.revokeObjectURL(url);
      reject(
        new Error(
          "Could not read this image format. Please try a JPEG, PNG, or WebP photo."
        )
      );
    };
    img.src = url;
  });
}

function clampCropRect(
  crop: CropRect,
  imgWidth: number,
  imgHeight: number
): CropRect {
  const sWidth = Math.max(1, Math.min(imgWidth, crop.sWidth));
  const sHeight = Math.max(1, Math.min(imgHeight, crop.sHeight));
  const sx = Math.max(0, Math.min(imgWidth - sWidth, crop.sx));
  const sy = Math.max(0, Math.min(imgHeight - sHeight, crop.sy));
  return { sx, sy, sWidth, sHeight };
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
 * Crops (or center-crops by default) an image to a 256x256 square JPEG data URL
 * (~15-35 KB) suitable for storing as a member profile picture.
 */
export async function compressAvatarImage(
  source: File | string,
  crop?: CropRect
): Promise<string> {
  if (source instanceof File && !isLikelyImageFile(source)) {
    throw new Error("Please select an image file (JPEG, PNG, or WebP).");
  }

  const loaded = await loadImageSource(source);
  try {
    if (loaded.width <= 0 || loaded.height <= 0) {
      throw new Error("That image appears to be empty or corrupted.");
    }

    const rect: CropRect = crop
      ? clampCropRect(crop, loaded.width, loaded.height)
      : (() => {
          const side = Math.min(loaded.width, loaded.height);
          return {
            sx: Math.floor((loaded.width - side) / 2),
            sy: Math.floor((loaded.height - side) / 2),
            sWidth: side,
            sHeight: side,
          };
        })();

    const targetSize = 256;

    const canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Image processing is unavailable in this browser.");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, targetSize, targetSize);
    ctx.drawImage(
      loaded.source,
      rect.sx,
      rect.sy,
      rect.sWidth,
      rect.sHeight,
      0,
      0,
      targetSize,
      targetSize
    );

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
 * Crops (optional), resizes, and compresses a Family Wall photo.
 * Targets <= 450 KB per photo so multi-photo posts reliably save within
 * serverless request payload limits.
 */
export async function compressWallPhoto(
  source: File | string,
  crop?: CropRect
): Promise<string> {
  if (source instanceof File && !isLikelyImageFile(source)) {
    throw new Error("Please select an image file (JPEG, PNG, or WebP).");
  }

  const loaded = await loadImageSource(source);
  try {
    if (loaded.width <= 0 || loaded.height <= 0) {
      throw new Error("That image appears to be empty or corrupted.");
    }

    const rect: CropRect = crop
      ? clampCropRect(crop, loaded.width, loaded.height)
      : {
          sx: 0,
          sy: 0,
          sWidth: loaded.width,
          sHeight: loaded.height,
        };

    const drawScaled = (maxEdge: number, qualities: number[], maxBytes: number) => {
      const scale = Math.min(1, maxEdge / Math.max(rect.sWidth, rect.sHeight));
      const width = Math.max(1, Math.round(rect.sWidth * scale));
      const height = Math.max(1, Math.round(rect.sHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Image processing is unavailable in this browser.");
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(
        loaded.source,
        rect.sx,
        rect.sy,
        rect.sWidth,
        rect.sHeight,
        0,
        0,
        width,
        height
      );
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
