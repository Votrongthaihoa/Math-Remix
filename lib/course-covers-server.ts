import {
  EXAM_IMAGE_MAX_STORED_BYTES,
  EXAM_IMAGE_MAX_UPLOAD_BYTES,
  imageResponseContentType,
  safeImageAsset,
  validateImageUpload,
} from "./exam-images-server";

export const COURSE_COVER_MAX_UPLOAD_BYTES = EXAM_IMAGE_MAX_UPLOAD_BYTES;
export const COURSE_COVER_MAX_STORED_BYTES = EXAM_IMAGE_MAX_STORED_BYTES;

export function courseCoverKey(assetName: string) {
  return `course-covers/${assetName}`;
}

export function courseCoverUrl(assetName: string) {
  return `/api/course-covers/${encodeURIComponent(assetName)}`;
}

export function courseCoverAssetFromUrl(value: string | null | undefined) {
  const match = String(value ?? "").match(/\/api\/course-covers\/([^/?#]+)/i);
  if (!match) return null;
  try {
    const assetName = decodeURIComponent(match[1] ?? "");
    return safeImageAsset(assetName) ? assetName : null;
  } catch {
    return null;
  }
}

export {
  imageResponseContentType,
  safeImageAsset,
  validateImageUpload,
};
