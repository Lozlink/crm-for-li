import { supabase } from './supabase';

const WHITEBOARD_PHOTO_BUCKET = 'whiteboard-photos';

interface UploadWhiteboardPhotoBufferInput {
  data: ArrayBuffer;
  mimeType?: string | null;
  fileName?: string | null;
}

function extensionForImage(mimeType?: string | null, fileName?: string | null): string {
  const fileNameExt = fileName?.split('.').pop()?.toLowerCase();
  if (fileNameExt) return fileNameExt.slice(0, 8);

  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
    case 'image/heif':
      return 'heic';
    default:
      return 'jpg';
  }
}

function normalizeMimeType(mimeType?: string | null, ext?: string): string {
  if (mimeType) return mimeType;

  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

export async function uploadWhiteboardPhotoBuffer({
  data,
  mimeType,
  fileName,
}: UploadWhiteboardPhotoBufferInput): Promise<string> {
  const ext = extensionForImage(mimeType, fileName);
  const contentType = normalizeMimeType(mimeType, ext);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data: uploaded, error } = await supabase.storage
    .from(WHITEBOARD_PHOTO_BUCKET)
    .upload(path, data, { contentType, upsert: false });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from(WHITEBOARD_PHOTO_BUCKET)
    .getPublicUrl(uploaded.path);

  return urlData.publicUrl;
}