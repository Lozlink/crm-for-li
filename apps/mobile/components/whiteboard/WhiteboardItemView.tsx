import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { IconButton, useTheme } from 'react-native-paper';
import { useWhiteboardStore } from '@realestate-crm/hooks';
import type { WhiteboardItem, WhiteboardStickyContent } from '@realestate-crm/types';
import type { WhiteboardMode } from './types';
import { WIDGET_DELETE_COLOR } from './whiteboardColors';

// --- Spring configs (DESIGN.md §4) ---
// Lift: responsive scale-up on drag start
const SPRING_LIFT = { mass: 0.4, damping: 14, stiffness: 220 } as const;
// Drop: springy landing with intentional overshoot so the note "lands"
const SPRING_DROP = { mass: 0.5, damping: 12, stiffness: 180 } as const;

// Snap-to-grid (16pt grid, DESIGN.md §1)
const GRID = 16;
const snap = (v: number) => Math.round(v / GRID) * GRID;
import { StickyNote } from './StickyNote';
import { ChecklistCard } from './ChecklistCard';
import { PhotoCard } from './PhotoCard';

interface Props {
  item: WhiteboardItem;
  mode: WhiteboardMode;
  /** Open the editor for this item. Wired in Edit mode for non-sticky types. */
  onRequestEdit: (id: string) => void;
  /** Open the context menu for this item. Wired via long-press in Move mode. */
  onRequestContext: (id: string) => void;
  /** Toggle a single checklist entry inline (Move mode only). */
  onToggleChecklistEntry: (itemId: string, entryId: string) => void;
  /** Delete an item. Wired to the × affordance in Edit mode. */
  onDelete: (id: string) => void;
}

/**
 * One draggable, tap/long-press-aware item card.
 *
 * Move mode  → Pan drags item; tap brings to front; long-press opens context menu.
 * Edit mode  → Pan disabled. Sticky text becomes focusable inline (no dialog).
 *              Checklist/Photo tap opens the editor sheet. × shows top-right (delete).
 *
 * Spec: see DESIGN.md §4 (BaseWidget — focus ring, lift animation, delete affordance).
 */
export function WhiteboardItemView({
  item,
  mode,
  onRequestEdit,
  onRequestContext,
  onToggleChecklistEntry,
  onDelete,
}: Props) {
  const theme = useTheme();
  const updateItemLocal = useWhiteboardStore(s => s.updateItemLocal);
  const commitItem = useWhiteboardStore(s => s.commitItem);
  const updateItem = useWhiteboardStore(s => s.updateItem);
  const bringToFront = useWhiteboardStore(s => s.bringToFront);

  // Shared values for the active gesture — separate from the persisted
  // position so we don't fight zustand re-renders mid-drag.
  const translateX = useSharedValue(item.position_x);
  const translateY = useSharedValue(item.position_y);
  const startX = useSharedValue(item.position_x);
  const startY = useSharedValue(item.position_y);
  const scale = useSharedValue(1);

  // Resync shared values when the persisted item changes from outside
  // (initial hydration, remote update, undo, etc).
  useEffect(() => {
    translateX.value = item.position_x;
    translateY.value = item.position_y;
  }, [item.position_x, item.position_y, translateX, translateY]);

  const persistPosition = (x: number, y: number) => {
    updateItemLocal(item.id, { position_x: x, position_y: y });
    void commitItem(item.id);
  };

  const handleSingleTap = () => {
    if (mode === 'edit') {
      // Sticky uses inline TextInput — let the input capture focus, no dialog.
      if (item.type !== 'sticky') {
        onRequestEdit(item.id);
      }
    } else {
      void bringToFront(item.id);
    }
  };

  const handleLongPress = () => {
    onRequestContext(item.id);
  };

  // Inline sticky text persistence — debounced via the store's optimistic
  // updateItem (which itself patches local then writes through to Supabase).
  const handleStickyTextChange = (text: string) => {
    void updateItem(item.id, {
      content: { text } as WhiteboardStickyContent,
    });
  };

  // --- Gestures -----------------------------------------------------------
  // Pan only in Move mode; in Edit mode the canvas + inputs need the touches.
  const pan = Gesture.Pan()
    .enabled(mode === 'move')
    .minDistance(4)
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
      // Lift: scale up slightly so the note floats above the canvas (DESIGN.md §4)
      scale.value = withSpring(1.04, SPRING_LIFT);
    })
    .onUpdate((e) => {
      // Free movement during drag — snap only on drop so motion feels fluid
      translateX.value = startX.value + e.translationX;
      translateY.value = startY.value + e.translationY;
    })
    .onEnd(() => {
      // Snap to 16pt grid with spring bounce — brief overshoot = note "lands" (DESIGN.md §4)
      const snappedX = snap(translateX.value);
      const snappedY = snap(translateY.value);
      translateX.value = withSpring(snappedX, SPRING_DROP);
      translateY.value = withSpring(snappedY, SPRING_DROP);
      // Return to rest scale
      scale.value = withSpring(1, SPRING_LIFT);
      runOnJS(persistPosition)(snappedX, snappedY);
    });

  // Tap is only attached in Move mode (Edit mode lets inner inputs receive taps).
  const tap = Gesture.Tap()
    .enabled(mode === 'move')
    .maxDuration(220)
    .onEnd((_e, success) => {
      if (success) runOnJS(handleSingleTap)();
    });

  const longPress = Gesture.LongPress()
    .enabled(mode === 'move')
    .minDuration(450)
    .onStart(() => {
      runOnJS(handleLongPress)();
    });

  const composed = Gesture.Race(pan, Gesture.Exclusive(longPress, tap));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const isEdit = mode === 'edit';

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          styles.itemRoot,
          {
            width: item.width,
            height: item.height,
            zIndex: item.z_index,
          },
          // Edit mode focus ring: 2pt primary border, 14pt radius (12 corner + 2 border)
          isEdit && {
            borderWidth: 2,
            borderColor: theme.colors.primary,
            borderRadius: 14,
          },
          animatedStyle,
        ]}
      >
        {/* Body widget — receives `editable` only in Edit mode. */}
        {item.type === 'sticky' && (
          <StickyNote
            item={item}
            editable={isEdit}
            onChangeText={handleStickyTextChange}
          />
        )}
        {item.type === 'checklist' && (
          <ChecklistCard
            item={item}
            onToggle={mode === 'move' ? (entryId) => onToggleChecklistEntry(item.id, entryId) : undefined}
          />
        )}
        {item.type === 'photo' && <PhotoCard item={item} editable={isEdit} />}

        {/* Edit-mode delete affordance (× button, top-right). DESIGN.md §4. */}
        {isEdit && (
          <View style={styles.deleteBtnWrap} pointerEvents="box-none">
            <IconButton
              icon="close-circle"
              size={20}
              iconColor={WIDGET_DELETE_COLOR}
              onPress={() => onDelete(item.id)}
              accessibilityLabel="Delete item"
              style={styles.deleteBtn}
            />
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  itemRoot: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  deleteBtnWrap: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    margin: 0,
  },
});
