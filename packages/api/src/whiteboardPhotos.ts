import Constants from 'expo-constants';
import { supabase } from './supabase';

const WHITEBOARD_PHOTO_BUCKET = 'whiteboard-photos';

interface UploadWhiteboardPhotoBufferInput {
  data: ArrayBuffer;
  mimeType?: string | null;
  fileName?: string | null;
}

interface UploadWhiteboardPhotoFileInput {
  /** Local file URI from the picker (e.g. expo-image-picker `asset.uri`). */
  uri: string;
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

/**
 * @deprecated Silently fails on Android (RN OkHttp + ArrayBuffer body
 * incompatibility). Use `uploadWhiteboardPhotoFile` instead. Kept here only
 * for callers that genuinely have a buffer in hand and not a file URI.
 *
 * The bug: `supabase.storage.upload(path, arrayBuffer)` wraps the buffer in
 * a `fetch()` request. iOS's URLSession handles ArrayBuffer bodies; Android's
 * OkHttp-backed fetch does not — it sends zero bytes or hangs without
 * throwing. Verified on production Android builds 2026-05-11.
 */
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

/**
 * Upload a photo to Supabase Storage by local file URI.
 *
 * Why this exists separately from `uploadWhiteboardPhotoBuffer`: passing an
 * ArrayBuffer to `supabase.storage.upload()` works on iOS but silently fails
 * on Android in production builds. RN Android's OkHttp-backed `fetch`
 * doesn't serialize ArrayBuffer request bodies correctly — the request goes
 * out with zero bytes (or hangs forever) and the SDK reports no error.
 *
 * The workaround documented by Supabase for React Native is to upload by
 * file URI via FormData/multipart, which RN handles natively (it's just an
 * `OkHttp.MultipartBody` on Android, an `NSURLRequest` body on iOS). The
 * Supabase JS SDK's `.upload()` method doesn't accept FormData, so we bypass
 * it and call the Storage REST endpoint directly with the user's session
 * token. `getPublicUrl` is still used for the post-upload URL because that
 * helper is pure URL composition, not a network call.
 *
 * Auth: we send `Authorization: Bearer <accessToken>` (the user's session)
 * plus `apikey: <anonKey>` (always required by Supabase Storage). For
 * unauthenticated public buckets the access token can be the anon key
 * itself; for RLS-protected buckets it must be the user's session JWT.
 */
export async function uploadWhiteboardPhotoFile({
  uri,
  mimeType,
  fileName,
}: UploadWhiteboardPhotoFileInput): Promise<string> {
  const ext = extensionForImage(mimeType, fileName);
  const contentType = normalizeMimeType(mimeType, ext);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const supabaseUrl = String(Constants.expoConfig?.extra?.SUPABASE_URL ?? '');
  const supabaseAnonKey = String(Constants.expoConfig?.extra?.SUPABASE_ANON_KEY ?? '');
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or anon key missing — cannot upload photo.');
  }

  // Pull the current session token so the Storage policy (RLS) sees the
  // actual signed-in user. Fall back to the anon key for buckets that
  // permit unauthenticated writes.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token ?? supabaseAnonKey;

  // FormData with `{uri, name, type}` is the React-Native-specific shape for
  // attaching a local file to a multipart request. Not standard DOM FormData,
  // but the RN runtime recognises it and emits a real multipart body. This
  // is the path that works on Android — the ArrayBuffer path doesn't.
  const formData = new FormData();
  formData.append('file', {
    uri,
    name: fileName ?? `photo.${ext}`,
    type: contentType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${WHITEBOARD_PHOTO_BUCKET}/${encodeURIComponent(path)}`;

  // POST creates a new object; PUT would overwrite. `x-upsert: false` mirrors
  // the upsert option on the JS SDK's `.upload()` — fail on conflict rather
  // than silently overwrite an existing path. (Conflict is unlikely here
  // since `path` is timestamp + random, but explicit > implicit.)
  //
  // DO NOT set Content-Type manually — fetch auto-generates the
  // `multipart/form-data; boundary=...` header from FormData. Setting it
  // by hand drops the boundary and the server rejects the body.
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
      'x-upsert': 'false',
    },
    // Cast to any because BodyInit isn't in the DOM-lib-free tsconfig for the
    // api package, but RN's fetch happily accepts a FormData here at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: formData as any,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Photo upload failed: HTTP ${response.status} ${response.statusText}` +
      (text ? ` — ${text}` : ''),
    );
  }

  // The Storage REST endpoint returns `{ Key: "bucket/path" }` on success,
  // but we use the SDK's URL helper for consistency with the rest of the
  // codebase (and so signed-URL flows would slot in later without rework).
  const { data: urlData } = supabase.storage
    .from(WHITEBOARD_PHOTO_BUCKET)
    .getPublicUrl(path);

  return urlData.publicUrl;
}
