// Resize + re-encode an image client-side before upload. iPhone photos are
// typically 7–11 MB and blow past Vercel's 4.5 MB function body limit;
// compressing to 2048px longest edge at 85% JPEG drops them under 1 MB
// with no loss of visible quality for reports or in-app display.
//
// Uses createImageBitmap({ imageOrientation: "from-image" }) so EXIF
// rotation (portrait shots, etc.) gets applied — without this, phone
// photos come out sideways. Safari 15+ supports it.

export type CompressOptions = {
  /** Longest edge of the output image. Default 2048. */
  maxEdge?: number;
  /** JPEG quality 0..1. Default 0.85. */
  quality?: number;
  /** Below this size, skip compression entirely (ms of CPU not worth it). */
  skipBelowBytes?: number;
};

export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const {
    maxEdge = 2048,
    quality = 0.85,
    skipBelowBytes = 500 * 1024,
  } = opts;

  if (!file.type.startsWith("image/")) return file;
  if (file.size < skipBelowBytes) return file;

  // HEIC/HEIF: most desktop browsers can't decode these into a canvas. iOS
  // Safari auto-converts to JPEG when picking from the photo library, but
  // originals from Files app stay HEIC. In that case we just return the
  // original and let the server path deal with it (or fail visibly).
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
  } catch {
    return file;
  }

  const longestEdge = Math.max(bitmap.width, bitmap.height);
  const scale = longestEdge > maxEdge ? maxEdge / longestEdge : 1;
  const targetW = Math.round(bitmap.width * scale);
  const targetH = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality,
    );
  });

  // If for some reason compression made the file bigger (tiny image),
  // keep the original.
  if (blob.size >= file.size) return file;

  const baseName = file.name.replace(
    /\.(heic|heif|png|jpg|jpeg|webp|gif|bmp|tiff)$/i,
    "",
  );
  return new File([blob], `${baseName || "photo"}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
