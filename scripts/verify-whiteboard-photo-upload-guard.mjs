import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const editItemSheetPath = path.resolve(
  scriptDir,
  '../apps/mobile/components/whiteboard/EditItemSheet.tsx',
);
const source = readFileSync(editItemSheetPath, 'utf8');

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

console.log('Whiteboard photo upload guard is wired correctly.');