import { useEffect, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { useWhiteboardStore } from '@realestate-crm/hooks';
import type { WhiteboardItem } from '@realestate-crm/types';
import { WORLD_WIDTH, WORLD_HEIGHT, clampItemPosition } from './whiteboardWorld';

// --- Spring configs (DESIGN.md §4) ---
// Lift: responsive scale-up on drag start
const SPRING_LIFT = { mass: 0.4, damping: 14, stiffness: 220 } as const;
// Drop: springy landing with intentional overshoot so the note "lands"
const SPRING_DROP = { mass: 0.5, damping: 12, stiffness: 180 } as const;

// Snap-to-grid (16pt grid, DESIGN.md §1).
// Called from gesture onEnd (a worklet that runs on the UI thread), so this
// helper itself must be a worklet — otherwise Reanimated throws
// "Tried to synchronously call a non-worklet function on the UI thread"
// and the app crashes when the user finishes dragging an item.
const GRID = 16;
const snap = (v: number) => {
  'worklet';
  return Math.round(v / GRID) * GRID;
};
import { StickyNote } from './StickyNote';
import { ChecklistCard } from './ChecklistCard';
import { PhotoCard } from './PhotoCard';
import { SuggestionCard } from './SuggestionCard';
import { GoalCard } from './GoalCard';
import { MapCard } from './MapCard';
import { ContactCard } from './ContactCard';
import { PropertyCard } from './PropertyCard';
import type { WhiteboardSuggestionItem } from './types';

interface Props {
  item: WhiteboardItem;
  /** Open the structured editor for this item (long-press). */
  onRequestEdit: (id: string) => void;
  /** Open the context menu for this item (unused path — kept for OverviewSheet / future use). */
  onRequestContext: (id: string) => void;
  /** Toggle a single checklist entry inline (tap on row). */
  onToggleChecklistEntry: (itemId: string, entryId: string) => void;
  /** Fired when the user taps "Done — remove?" on a fully-checked checklist. */
  onCompleteChecklist?: (id: string) => void;
  /** Delete an item — wired from ItemContextMenu which is opened via long-press. */
  onDelete: (id: string) => void;
}

/**
 * One draggable, tap/long-press-aware item card.
 *
 * Gesture model (mode-free):
 *   Tap        → bringToFront
 *   Long-press → open structured editor (EditItemSheet)
 *   Drag       → move item; snap-to-grid on drop; clamp within world bounds
 *
 * Spec: see DESIGN.md §4 (BaseWidget — lift animation, snap-to-grid landing).
 */
export function WhiteboardItemView({
  item,
  onRequestEdit,
  onRequestContext,
  onToggleChecklistEntry,
  onCompleteChecklist,
  onDelete,
}: Props) {
  const updateItemLocal = useWhiteboardStore(s => s.updateItemLocal);
  const commitItem = useWhiteboardStore(s => s.commitItem);
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

  // One-time world-bounds migration: items persisted at positions > 4000pt
  // (from the old 6000pt world) are clamped on first mount and written back
  // so they're permanently visible inside the new world.
  const hasMigratedRef = useRef(false);
  useEffect(() => {
    if (hasMigratedRef.current) return;
    hasMigratedRef.current = true;
    const clampedX = clampItemPosition(item.position_x, item.width, WORLD_WIDTH);
    const clampedY = clampItemPosition(item.position_y, item.height, WORLD_HEIGHT);
    if (clampedX !== item.position_x || clampedY !== item.position_y) {
      translateX.value = clampedX;
      translateY.value = clampedY;
      updateItemLocal(item.id, { position_x: clampedX, position_y: clampedY });
      void commitItem(item.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistPosition = (x: number, y: number) => {
    updateItemLocal(item.id, { position_x: x, position_y: y });
    void commitItem(item.id);
  };

  const handleSingleTap = () => {
    void bringToFront(item.id);
  };

  const handleLongPress = () => {
    // Long-press always opens the editor for all item types.
    // For suggestion cards we open the context menu (they have no editable fields).
    if (item.type === 'suggestion') {
      onRequestContext(item.id);
    } else {
      onRequestEdit(item.id);
    }
  };

  // --- Gestures -----------------------------------------------------------
  // Android touchscreens have noisier touch detection than iOS; a 4pt threshold
  // triggers accidental drags from finger jitter during taps. Bump to 8pt on
  // Android so brief touches with small drift resolve as taps, not drags.
  const PAN_MIN_DISTANCE = Platform.select({ android: 8, default: 4 });
  // Android users tap slightly slower on average; give Tap more time to resolve
  // before the Race hands the touch to Pan.
  const TAP_MAX_DURATION = Platform.select({ android: 280, default: 220 });

  // Pan is always enabled — no mode gate.
  const pan = Gesture.Pan()
    .minDistance(PAN_MIN_DISTANCE)
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
      // Then clamp inside the world bounds so the item can't be dragged past
      // the canvas edges and lost (the camera is also clamped, so an off-world
      // item would be unreachable). `item.width/height` keep the full body
      // visible inside the world rather than letting the top-left poke past.
      const snappedX = clampItemPosition(snap(translateX.value), item.width, WORLD_WIDTH);
      const snappedY = clampItemPosition(snap(translateY.value), item.height, WORLD_HEIGHT);
      translateX.value = withSpring(snappedX, SPRING_DROP);
      translateY.value = withSpring(snappedY, SPRING_DROP);
      // Return to rest scale
      scale.value = withSpring(1, SPRING_LIFT);
      runOnJS(persistPosition)(snappedX, snappedY);
    });

  // Tap always brings to front — no mode gate.
  const tap = Gesture.Tap()
    .maxDuration(TAP_MAX_DURATION)
    .onEnd((_e, success) => {
      if (success) runOnJS(handleSingleTap)();
    });

  // Long-press always opens the editor — no mode gate.
  const longPress = Gesture.LongPress()
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
          animatedStyle,
        ]}
      >
        {/* Sticky: always read-only on canvas; edit text via long-press → editor. */}
        {item.type === 'sticky' && (
          <StickyNote item={item} />
        )}
        {item.type === 'checklist' && (
          <ChecklistCard
            item={item}
            onToggle={(entryId) => onToggleChecklistEntry(item.id, entryId)}
            onComplete={onCompleteChecklist ? () => onCompleteChecklist(item.id) : undefined}
          />
        )}
        {item.type === 'photo' && <PhotoCard item={item} />}

        {/* Suggestion card — read-only; added from IntelligenceSidebar. DESIGN.md §12. */}
        {item.type === 'suggestion' && (
          <SuggestionCard item={item as WhiteboardSuggestionItem} />
        )}
        {item.type === 'goal' && <GoalCard item={item} />}
        {item.type === 'map' && <MapCard item={item} />}
        {item.type === 'contact' && <ContactCard item={item} />}
        {item.type === 'property' && <PropertyCard item={item} />}
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
});
