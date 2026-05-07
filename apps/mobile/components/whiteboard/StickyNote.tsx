import { useColorScheme, StyleSheet, Text, View } from 'react-native';
import type { WhiteboardItem, WhiteboardStickyContent } from '@realestate-crm/types';
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
 */
export function StickyNote({ item }: Props) {
  const colorScheme = useColorScheme();
  const content = item.content as WhiteboardStickyContent | undefined;
  const text = content?.text ?? '';

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
