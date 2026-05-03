import { useColorScheme, StyleSheet, TextInput, View } from 'react-native';
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
  /** When true the TextInput is focusable (Edit mode). Read-only in Move mode. */
  editable?: boolean;
  onChangeText?: (text: string) => void;
}

/**
 * Sticky note body widget.
 *
 * Design tokens (see DESIGN.md §5):
 * - 12pt corner radius
 * - Flat look with a soft iOS/Android drop-shadow (no Paper elevation)
 * - 15/22 custom font (not a Paper variant — stickies feel handwritten)
 * - Placeholder: "Quick note…" at 40% opacity
 * - Background swaps between light/dark palette from whiteboardColors.ts
 */
export function StickyNote({ item, editable = false, onChangeText }: Props) {
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
      <TextInput
        style={styles.textInput}
        value={text}
        onChangeText={onChangeText}
        multiline
        editable={editable}
        placeholder="Quick note…"
        placeholderTextColor={STICKY_PLACEHOLDER_COLOR}
        textAlignVertical="top"
        scrollEnabled={false}
        // Suppress the system keyboard toolbar / autocorrect chrome on stickies.
        autoCorrect={false}
        autoCapitalize="sentences"
        // Prevent the underlying canvas scroll from fighting the TextInput.
        keyboardType="default"
        returnKeyType="default"
      />
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
  textInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: STICKY_TEXT_COLOR,
    // Remove default TextInput chrome
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0,
    margin: 0,
  },
});
