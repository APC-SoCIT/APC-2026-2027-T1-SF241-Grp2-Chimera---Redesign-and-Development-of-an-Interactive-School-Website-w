import type { AnnouncementImage } from "@/lib/content/model";

export interface CmsImage {
  id: string;
  name: string;
  alt: string;
  caption?: string;
}

export type CmsImageAsset = Required<Pick<AnnouncementImage, "src" | "width" | "height">>;
export type CmsImageAssets = Record<string, CmsImageAsset>;

export const maxContentImages = 4;
const maxFileSize = 5 * 1024 * 1024;
const maxStoredLength = 360 * 1024;

function isSupportedImage(bytes: Uint8Array) {
  const chars = String.fromCharCode(...bytes);
  return (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    || chars.startsWith("\x89PNG\r\n\x1a\n")
    || (chars.startsWith("RIFF") && chars.slice(8, 12) === "WEBP");
}

export async function prepareImage(file: File): Promise<{ image: CmsImage; asset: CmsImageAsset }> {
  if (file.size > maxFileSize) throw new Error("Choose an image of 5 MB or less.");
  if (!isSupportedImage(new Uint8Array(await file.slice(0, 12).arrayBuffer()))) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  const url = URL.createObjectURL(file);
  try {
    const source = new Image();
    source.src = url;
    try {
      await source.decode();
    } catch {
      throw new Error("This image could not be opened.");
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context || !source.naturalWidth || !source.naturalHeight) throw new Error("This image could not be opened.");

    for (const limit of [1600, 1200, 900, 640, 420]) {
      const scale = Math.min(1, limit / Math.max(source.naturalWidth, source.naturalHeight));
      const width = Math.max(1, Math.round(source.naturalWidth * scale));
      const height = Math.max(1, Math.round(source.naturalHeight * scale));
      canvas.width = width;
      canvas.height = height;
      context.drawImage(source, 0, 0, width, height);
      const src = canvas.toDataURL("image/webp", 0.85);
      if (src.length <= maxStoredLength) {
        return {
          image: { id: crypto.randomUUID(), name: file.name, alt: "" },
          asset: { src, width, height },
        };
      }
    }
    throw new Error("This image is too large. Choose a smaller file.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function imageForDisplay(image: CmsImage, asset: CmsImageAsset | undefined): AnnouncementImage | undefined {
  // Images prepared in this browser, or uploaded to the school's content-images bucket.
  if (!asset || !(/^data:image\/(webp|png);base64,/.test(asset.src)
    || /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/content-images\//.test(asset.src))) return undefined;
  return { ...asset, alt: image.alt, caption: image.caption };
}
