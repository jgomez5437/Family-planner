const DATA_IMAGE_RE = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const HTTP_IMAGE_RE = /^https?:\/\/.+/i;

export const MAX_AVATAR_BYTES = 260 * 1024; // ~260 KB data URL cap
export const MAX_POST_IMAGE_COUNT = 6;
export const MAX_SINGLE_POST_IMAGE_BYTES = 750 * 1024; // ~750 KB per compressed photo
export const MAX_TOTAL_POST_IMAGES_BYTES = 3.2 * 1024 * 1024; // ~3.2 MB total (safely below Vercel's 4.5 MB limit)

function isValidImageString(value: string): boolean {
  return DATA_IMAGE_RE.test(value) || HTTP_IMAGE_RE.test(value);
}

export function validateAvatarUrl(
  raw: unknown
): { ok: true; value: string | null | undefined } | { ok: false; error: string; status: number } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") {
    return { ok: false, error: "Invalid profile photo format.", status: 400 };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!isValidImageString(trimmed)) {
    return {
      ok: false,
      error: "Profile photo must be a valid JPEG, PNG, WebP, or GIF image.",
      status: 400,
    };
  }
  if (trimmed.length > MAX_AVATAR_BYTES) {
    return {
      ok: false,
      error: "Profile photo is too large. Please try a smaller image.",
      status: 413,
    };
  }
  return { ok: true, value: trimmed };
}

export function validatePostImages(
  raw: unknown
): { ok: true; images: string[] } | { ok: false; error: string; status: number } {
  if (raw === undefined || raw === null) {
    return { ok: true, images: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Invalid photos payload.", status: 400 };
  }
  if (raw.length > MAX_POST_IMAGE_COUNT) {
    return {
      ok: false,
      error: `You can attach up to ${MAX_POST_IMAGE_COUNT} photos per post.`,
      status: 400,
    };
  }

  const images: string[] = [];
  let totalBytes = 0;

  for (const item of raw) {
    if (typeof item !== "string") {
      return { ok: false, error: "One of the photos is invalid.", status: 400 };
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (!isValidImageString(trimmed)) {
      return {
        ok: false,
        error: "Unsupported image format. Please use JPEG, PNG, WebP, or GIF.",
        status: 400,
      };
    }
    if (trimmed.length > MAX_SINGLE_POST_IMAGE_BYTES) {
      return {
        ok: false,
        error: "A photo is too large to save. Please try a smaller photo.",
        status: 413,
      };
    }
    totalBytes += trimmed.length;
    if (totalBytes > MAX_TOTAL_POST_IMAGES_BYTES) {
      return {
        ok: false,
        error: "The attached photos are too large together. Try attaching fewer photos.",
        status: 413,
      };
    }
    images.push(trimmed);
  }

  return { ok: true, images };
}
