import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const editItemSheetPath = path.resolve(
  scriptDir,
  '../apps/mobile/components/whiteboard/EditItemSheet.tsx',
);
const photoWidgetPath = path.resolve(
  scriptDir,
  '../apps/web/src/components/whiteboard/PhotoWidget.tsx',
);
const sharedUploadHelperPath = path.resolve(
  scriptDir,
  '../packages/api/src/whiteboardPhotos.ts',
);
const source = readFileSync(editItemSheetPath, 'utf8');
const webSource = readFileSync(photoWidgetPath, 'utf8');
const helperSource = readFileSync(sharedUploadHelperPath, 'utf8');

assert.match(
  source,
  /const\s+photoUploadLocked\s*=\s*item\.type\s*===\s*'photo'\s*&&\s*photoUploading;/,
  'EditItemSheet should derive a dedicated photo-upload lock state.',
);

assert.match(
  source,
  /const\s+handleDialogDismiss\s*=\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(photoUploadLocked\)\s*return;[\s\S]*?onDismiss\(\);[\s\S]*?\}/,
  'EditItemSheet should refuse dialog dismissal while a photo upload is running.',
);

assert.match(
  source,
  /if\s*\(item\.type\s*===\s*'photo'\s*&&\s*photoUploadLocked\)\s*return;/,
  'EditItemSheet should block Save while a photo upload is still in progress.',
);

assert.match(
  source,
  /<Dialog[\s\S]*?dismissable=\{!photoUploadLocked\}[\s\S]*?dismissableBackButton=\{!photoUploadLocked\}/,
  'EditItemSheet should disable outside/back dismissal during photo upload.',
);

assert.match(
  source,
  /<Button\s+onPress=\{handleDialogDismiss\}\s+disabled=\{photoUploadLocked\}>Cancel<\/Button>/,
  'Cancel should be disabled while a photo upload is running.',
);

assert.match(
  source,
  /<Button\s+mode="contained"\s+onPress=\{handleSave\}\s+disabled=\{photoUploadLocked\}>Save<\/Button>/,
  'Save should be disabled while a photo upload is running.',
);

assert.match(
  source,
  /const\s+uploadPhoto\s*=\s*async\s*\(asset:\s*ImagePicker\.ImagePickerAsset\):\s*Promise<string\s*\|\s*null>\s*=>/,
  'Photo uploads should use the picked asset metadata directly instead of only a raw URI string.',
);

assert.match(
  source,
  /const\s+base64Payload\s*=\s*asset\.base64\s*\?\?\s*null;/,
  'Photo uploads should require picker-provided base64 data so the native upload body is reliable on mobile.',
);

assert.match(
  source,
  /uploadWhiteboardPhotoBuffer\(/,
  'Mobile photo uploads should go through the shared whiteboard photo upload helper.',
);

assert.match(
  webSource,
  /uploadWhiteboardPhotoBuffer\(/,
  'Web photo uploads should go through the shared whiteboard photo upload helper too.',
);

assert.match(
  helperSource,
  /export\s+async\s+function\s+uploadWhiteboardPhotoBuffer\(/,
  'The shared whiteboard photo upload helper should exist in the API package.',
);

assert.match(
  helperSource,
  /\.from\(WHITEBOARD_PHOTO_BUCKET\)\s*\.upload\(/,
  'The shared helper should own the Supabase storage upload call.',
);

assert.match(
  source,
  /launchCameraAsync\([\s\S]*?base64:\s*true,/,
  'Camera photo picking should request base64 data for upload.',
);

assert.match(
  source,
  /launchImageLibraryAsync\([\s\S]*?base64:\s*true,/,
  'Library photo picking should request base64 data for upload.',
);

console.log('Whiteboard photo upload flow is wired correctly.');