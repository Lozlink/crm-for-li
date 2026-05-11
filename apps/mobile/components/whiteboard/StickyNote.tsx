import { useEffect, useRef } from 'react';
import { useColorScheme, StyleSheet, Text, View } from 'react-native';
import type { WhiteboardItem, WhiteboardStickyContent } from '@realestate-crm/types';
import { reverseGeocode } from '@realestate-crm/api';
import { useWhiteboardStore } from '@realestate-crm/hooks';
import {
  STICKY_COLOR_DEFS,
  stickyColorForScheme,
  stickyColorKey,
  STICKY_TEXT_COLOR,
  STICKY_PLACEHOLDER_COLOR,
  DEFAULT_STICKY_COLOR_DEF,
} from './whiteboardColors';

interface Props {
  item: WhiteboardItem;
}

/**
 * Detects the legacy "Field note @ <lat>, <lng>" header pattern that
 * pre-2026-05-11 pinned field-notes were saved with. The geocode-on-pin
 * fix only applies to NEW pins; existing stickies kept their raw-coord
 * header until visited again. Matching it lets us self-heal on render.
 */
const LEGACY_FIELD_NOTE_HEADER = /^Field note @ (-?\d+\.\d+),\s*(-?\d+\.\d+)/;

/**
 * Sticky note body widget — always read-only on canvas.
 *
 * Text editing is done via long-press → EditItemSheet. This keeps the
 * gesture model clean: drag-to-move never conflicts with a focused TextInput.
 *
 * Design tokens (see DESIGN.md §5):
 * - 12pt corner radius
 * - Flat look with a soft drop-shadow (no Paper elevation)
 * - 15/22 custom font (not a Paper variant — stickies feel handwritten)
 * - Placeholder: "Quick note…" at 40% opacity
 * - Background swaps between light/dark palette from whiteboardColors.ts
 *
 * Legacy field-note migration (2026-05-11): if the sticky text starts
 * with "Field note @ <lat>, <lng>", reverse-geocode and overwrite the
 * stored text so future renders read as a street address. Runs at most
 * once per item per session via a local ref guard.
 */
export function StickyNote({ item }: Props) {
  const colorScheme = useColorScheme();
  const content = item.content as WhiteboardStickyContent | undefined;
  const text = content?.text ?? '';

  // Self-healing migration for legacy field-note stickies. Each rendered
  // instance attempts the upgrade at most once thanks to the ref guard
  // (avoids re-running on every re-render even before the network call
  // completes).
  const updateItem = useWhiteboardStore((s) => s.updateItem);
  const migrationAttemptedRef = useRef(false);
  useEffect(() => {
    if (migrationAttemptedRef.current) return;
    const match = LEGACY_FIELD_NOTE_HEADER.exec(text);
    if (!match) return;
    migrationAttemptedRef.current = true;

    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    void (async () => {
      const geocoded = await reverseGeocode(lat, lng).catch(() => null);
      if (!geocoded?.address) return;
      // Replace just the header line; preserve the rest of the sticky
      // body (date line, blank line, user-written note).
      const updatedText = text.replace(LEGACY_FIELD_NOTE_HEADER, `Field note @ ${geocoded.address}`);
      if (updatedText === text) return;
      void updateItem(item.id, { content: { ...content, text: updatedText } });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // Resolve the correct background for this sticky color in the current scheme.
  const storedColorKey = item.color ?? DEFAULT_STICKY_COLOR_DEF.light;
  const colorDef =
    STICKY_COLOR_DEFS.find((d) => stickyColorKey(d) === storedColorKey) ??
    DEFAULT_STICKY_COLOR_DEF;
  const bg = stickyColorForScheme(colorDef, colorScheme);

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {text.length > 0 ? (
        <Text style={styles.text}>{text}</Text>
      ) : (
        <Text style={[styles.text, styles.placeholder]}>Quick note…</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    paddingTop: 8, // top 8pt reserved for drag-handle area (BaseWidget overlay)
    // Flat sticky-note shadow — intentionally softer than a Paper card.
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  text: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: STICKY_TEXT_COLOR,
  },
  placeholder: {
    color: STICKY_PLACEHOLDER_COLOR,
  },
});
