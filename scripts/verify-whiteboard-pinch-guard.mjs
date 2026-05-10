import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const whiteboardCanvasPath = path.resolve(
  scriptDir,
  '../apps/mobile/components/whiteboard/WhiteboardCanvas.tsx',
);
const source = readFileSync(whiteboardCanvasPath, 'utf8');

assert.match(
  source,
  /<GestureDetector\s+gesture=\{cameraPinch\}>/,
  'WhiteboardCanvas should keep pinch at the root so two-finger zoom still works across the board.',
);

assert.match(
  source,
  /<GestureDetector\s+gesture=\{movePan\}>\s*<View\s+style=\{StyleSheet\.absoluteFill\}/,
  'Single-finger camera pan should live on a dedicated empty-space background layer instead of the whole viewport.',
);

assert.doesNotMatch(
  source,
  /Gesture\.Simultaneous\(cameraPinch,\s*movePan\)/,
  'Canvas pan should no longer be composed at the root, or it will still hijack item and button touches.',
);

console.log('Whiteboard interaction guard is wired correctly.');