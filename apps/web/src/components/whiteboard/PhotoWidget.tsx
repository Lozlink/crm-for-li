'use client';

import { useRef, useCallback } from 'react';
import type { WhiteboardItem, WhiteboardPhotoContent } from '@realestate-crm/types';
import { supabase } from '@realestate-crm/api';

interface Props {
  item: WhiteboardItem;
  /** Edit mode: shows replace overlay and file picker on click. */
  editable: boolean;
  onPhotoUpdate: (content: WhiteboardPhotoContent) => void;
}

/**
 * Photo widget body — web version.
 *
 * DESIGN.md §7:
 * - Empty state: dashed 2px border, image icon centered, "Tap to add a photo".
 * - Filled: cover image, 12px corner radius.
 * - Edit mode: camera-retake overlay at 40% opacity, click opens file picker.
 *
 * Upload strategy:
 * 1. Pick a file → create blob URL → optimistically update local_uri for instant preview.
 * 2. Upload to Supabase storage bucket "whiteboard-photos" in background.
 * 3. On success: replace local_uri with permanent url.
 * 4. On failure: blob URL remains for the session (acceptable v1 limitation).
 */
export function PhotoWidget({ item, editable, onPhotoUpdate }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const content = item.content as WhiteboardPhotoContent | undefined;
  const uri = content?.local_uri ?? content?.url ?? null;
  const caption = (content?.caption ?? '').trim();
  const hasPhoto = Boolean(uri);

  const handleClick = useCallback(() => {
    if (!editable) return;
    fileInputRef.current?.click();
  }, [editable]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Instant preview via blob URL
      const blobUrl = URL.createObjectURL(file);
      onPhotoUpdate({ url: content?.url ?? '', local_uri: blobUrl, caption: content?.caption });

      // Upload to Supabase storage (best-effort)
      try {
        const ext = file.name.split('.').pop() ?? 'jpg';
        const path = `${crypto.randomUUID()}.${ext}`;
        const { data, error } = await supabase.storage
          .from('whiteboard-photos')
          .upload(path, file, { upsert: false });

        if (!error && data) {
          const { data: urlData } = supabase.storage
            .from('whiteboard-photos')
            .getPublicUrl(data.path);
          onPhotoUpdate({
            url: urlData.publicUrl,
            local_uri: undefined,
            caption: content?.caption,
          });
        }
      } catch {
        // Storage bucket may not exist — blob URL stays as preview
      }

      // Reset input so the same file can be re-picked
      e.target.value = '';
    },
    [content, onPhotoUpdate],
  );

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden rounded-xl bg-white"
      style={{
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.10)',
      }}
    >
      {/* Image area */}
      <div
        className={`relative flex-1 overflow-hidden rounded-xl ${
          !hasPhoto ? 'flex items-center justify-center' : ''
        } ${editable && !hasPhoto ? 'cursor-pointer' : ''}`}
        style={
          !hasPhoto
            ? { border: '2px dashed rgba(0,0,0,0.25)', margin: 8, borderRadius: 8 }
            : undefined
        }
        onClick={editable ? handleClick : undefined}
        role={editable ? 'button' : undefined}
        tabIndex={editable ? 0 : undefined}
        onKeyDown={
          editable
            ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }
            : undefined
        }
        aria-label={editable ? 'Add or replace photo' : undefined}
      >
        {hasPhoto ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={uri!}
              alt={caption || 'Whiteboard photo'}
              className="h-full w-full rounded-xl object-cover"
            />
            {/* Edit overlay */}
            {editable && (
              <div
                className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-xl"
                style={{ backgroundColor: 'rgba(0,0,0,0.40)' }}
                onClick={handleClick}
              >
                <CameraRetakeIcon className="h-8 w-8 text-white" />
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5 p-4">
            <ImagePlusIcon className="h-8 w-8 text-gray-400" />
            <span className="text-center text-xs text-gray-400">
              {editable ? 'Click to add a photo' : 'No photo added'}
            </span>
          </div>
        )}
      </div>

      {/* Caption — shown when present */}
      {caption && (
        <p className="line-clamp-2 px-2 pb-1 pt-0.5 text-xs text-gray-500">{caption}</p>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
      />
    </div>
  );
}

function ImagePlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v6m3-3H9" />
    </svg>
  );
}

function CameraRetakeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
  );
}
