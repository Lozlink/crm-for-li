import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Snackbar, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { useWhiteboardStore } from '@realestate-crm/hooks';
import { CanvasViewControls, type WorldBounds } from '../components/shared/CanvasViewControls';
import { WORLD_WIDTH, WORLD_HEIGHT, clampCameraTranslate } from '../components/whiteboard/whiteboardWorld';
import { Minimap } from '../components/whiteboard/Minimap';
import type {
  WhiteboardChecklistContent,
  WhiteboardContactContent,
  WhiteboardGoalContent,
  WhiteboardItem,
  WhiteboardItemType,
  WhiteboardMapContent,
  WhiteboardPhotoContent,
  WhiteboardPropertyContent,
  WhiteboardStickyContent,
} from '@realestate-crm/types';
import { WhiteboardCanvas } from '../components/whiteboard/WhiteboardCanvas';
import { WhiteboardToolbar } from '../components/whiteboard/WhiteboardToolbar';
import { EditItemSheet } from '../components/whiteboard/EditItemSheet';
import { ItemContextMenu } from '../components/whiteboard/ItemContextMenu';
import { AddWidgetSheet } from '../components/whiteboard/AddWidgetSheet';
import { IntelligenceSidebar } from '../components/whiteboard/IntelligenceSidebar';
import { OverviewSheet } from '../components/whiteboard/OverviewSheet';
import {
  CHECKLIST_DEFAULT_SIZE,
  ITEM_DEFAULT_SIZE,
  PHOTO_DEFAULT_SIZE,
  SUGGESTION_CARD_DEFAULT_SIZE,
  type SmartSuggestion,
  type WhiteboardSuggestionContent,
} from '../components/whiteboard/types';
import { DEFAULT_STICKY_COLOR_DEF, stickyColorKey } from '../components/whiteboard/whiteboardColors';

/**
 * Phase 1 Smart Whiteboard route.
 *
 * Composes:
 *  - WhiteboardCanvas       (camera-pan + items)
 *  - WhiteboardToolbar      (close + mode pill + add menu)
 *  - EditItemSheet          (structured edit for checklist/photo)
 *  - ItemContextMenu        (long-press: bring-to-front / change color / delete)
 *
 * Persistence is delegated to useWhiteboardStore which mirrors the
 * useDeclaredBuildingsStore optimistic-write pattern.
 */
export default function WhiteboardScreen() {
  const router = useRouter();
  const theme = useTheme();

  const items = useWhiteboardStore((s) => s.items);
  const error = useWhiteboardStore((s) => s.error);
  const createItem = useWhiteboardStore((s) => s.createItem);
  const updateItem = useWhiteboardStore((s) => s.updateItem);
  const deleteItem = useWhiteboardStore((s) => s.deleteItem);
  const bringToFront = useWhiteboardStore((s) => s.bringToFront);

  // Camera shared values lifted up from WhiteboardCanvas — placementForNew
  // reads these to compute viewport-center world coords (canvas v2).
  const cameraX = useSharedValue(0);
  const cameraY = useSharedValue(0);
  const cameraScale = useSharedValue(1);
  const { width: screenW, height: screenH } = useWindowDimensions();

  // DEV-ONLY: log every camera-state change on the UI thread so we can identify
  // which writer is producing unexpected values at mount (currently cameraY
  // appears at ~-2888 in the first minimap log even though useSharedValue
  // initializes to 0). useDerivedValue re-runs whenever any read shared value
  // changes; logging here shows every write site's effect in chronological order.
  // Hook runs unconditionally to satisfy rules-of-hooks; the log itself is
  // gated on __DEV__ so it dead-code-eliminates in production bundles.
  useDerivedValue(() => {
    if (__DEV__) {
      console.log(
        `[whiteboard:camera-watch] cameraX=${cameraX.value.toFixed(1)} cameraY=${cameraY.value.toFixed(1)} scale=${cameraScale.value.toFixed(4)} itemsCount=${items.length}`,
      );
    }
  });

  // Bounding box of all items — fed into CanvasViewControls for Fit All.
  const worldBounds = useMemo<WorldBounds | null>(() => {
    if (items.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of items) {
      minX = Math.min(minX, it.position_x);
      minY = Math.min(minY, it.position_y);
      maxX = Math.max(maxX, it.position_x + it.width);
      maxY = Math.max(maxY, it.position_y + it.height);
    }
    return { minX, minY, maxX, maxY };
  }, [items]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [contextId, setContextId] = useState<string | null>(null);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [intelligenceSidebarVisible, setIntelligenceSidebarVisible] = useState(false);
  const [overviewVisible, setOverviewVisible] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  // Captured shape of a just-deleted checklist item — kept for 5s so Undo can recreate it.
  const [undoDeleteItem, setUndoDeleteItem] = useState<WhiteboardItem | null>(null);

  const editingItem = useMemo<WhiteboardItem | null>(
    () => items.find((it) => it.id === editingId) ?? null,
    [items, editingId],
  );
  const contextItem = useMemo<WhiteboardItem | null>(
    () => items.find((it) => it.id === contextId) ?? null,
    [items, contextId],
  );

  // --- Add -----------------------------------------------------------------
  // Canvas v2: drop new items at the visible viewport center, accounting for
  // camera offset and zoom.  World coords from screen coords:
  //   worldX = (screenX - cameraX) / scale
  // For the visible viewport center we then subtract half the widget size so
  // the *card* sits centered (rather than its top-left landing on center).
  // Small jitter avoids perfect stacking when adding many widgets in a row.
  const placementForNew = useCallback(
    (widgetWidth = 200, widgetHeight = 160) => {
      const sx = cameraX.value ?? 0;
      const sy = cameraY.value ?? 0;
      const sc = cameraScale.value || 1;
      const visibleH = screenH - 80;  // headroom for bottom toolbar
      const worldCenterX = (screenW / 2 - sx) / sc;
      const worldCenterY = (visibleH / 2 - sy) / sc;
      const jitter = (items.length % 4) * 12;
      return {
        x: Math.round(worldCenterX - widgetWidth / 2 + jitter),
        y: Math.round(worldCenterY - widgetHeight / 2 + jitter),
      };
    },
    [cameraX, cameraY, cameraScale, screenW, screenH, items.length],
  );

  const handleAddItem = useCallback(
    async (type: WhiteboardItemType) => {
      const { x, y } = placementForNew();

      if (type === 'sticky') {
        const stickyContent: WhiteboardStickyContent = { text: '' };
        const created = await createItem({
          type: 'sticky',
          position_x: x,
          position_y: y,
          width: ITEM_DEFAULT_SIZE.width,
          height: ITEM_DEFAULT_SIZE.height,
          content: stickyContent,
          color: stickyColorKey(DEFAULT_STICKY_COLOR_DEF),
        });
        if (!created) {
          setSnackbar('Could not add note. Check your connection.');
        } else {
          // Open editor so the user can type the note text immediately.
          setEditingId(created.id);
        }
        return;
      }

      if (type === 'checklist') {
        const checklistContent: WhiteboardChecklistContent = {
          title: '',
          items: [],
        };
        const created = await createItem({
          type: 'checklist',
          position_x: x,
          position_y: y,
          width: CHECKLIST_DEFAULT_SIZE.width,
          height: CHECKLIST_DEFAULT_SIZE.height,
          content: checklistContent,
        });
        if (!created) {
          setSnackbar('Could not add to-do. Check your connection.');
        } else {
          // Open editor immediately so the user can populate it.
          setEditingId(created.id);
        }
        return;
      }

      if (type === 'photo') {
        const photoContent: WhiteboardPhotoContent = { url: '' };
        const created = await createItem({
          type: 'photo',
          position_x: x,
          position_y: y,
          width: PHOTO_DEFAULT_SIZE.width,
          height: PHOTO_DEFAULT_SIZE.height,
          content: photoContent,
        });
        if (!created) {
          setSnackbar('Could not add photo. Check your connection.');
        } else {
          setEditingId(created.id);
        }
        return;
      }

      if (type === 'goal') {
        // Sensible default — agents most commonly track monthly commission.
        const goalContent: WhiteboardGoalContent = {
          metric: 'commission',
          target: 5000,
          period: 'month',
          current: 0,
        };
        const created = await createItem({
          type: 'goal',
          position_x: x,
          position_y: y,
          width: 200,
          height: 140,
          content: goalContent,
        });
        if (!created) setSnackbar('Could not add goal. Check your connection.');
        return;
      }

      if (type === 'map') {
        // Drop a pin at a sensible default. Agents can re-position via context
        // menu later (or via a future picker). Sydney CBD coords used as a
        // safe Australian default.
        const mapContent: WhiteboardMapContent = {
          viewport: { lat: -33.8688, lng: 151.2093, zoom: 13 },
        };
        const created = await createItem({
          type: 'map',
          position_x: x,
          position_y: y,
          width: 180,
          height: 160,
          content: mapContent,
        });
        if (!created) setSnackbar('Could not add map pin. Check your connection.');
        return;
      }

      if (type === 'contact') {
        // Empty card — opens editor immediately so user picks a contact.
        const contactContent: WhiteboardContactContent = { contactId: '' };
        const created = await createItem({
          type: 'contact',
          position_x: x,
          position_y: y,
          width: 220,
          height: 110,
          content: contactContent,
        });
        if (!created) setSnackbar('Could not add contact card. Check your connection.');
        else setEditingId(created.id);
        return;
      }

      if (type === 'property') {
        const propertyContent: WhiteboardPropertyContent = { propertyId: '' };
        const created = await createItem({
          type: 'property',
          position_x: x,
          position_y: y,
          width: 220,
          height: 130,
          content: propertyContent,
        });
        if (!created) setSnackbar('Could not add property card. Check your connection.');
        else setEditingId(created.id);
        return;
      }
    },
    [createItem, placementForNew],
  );

  // --- Intelligence sidebar: add suggestion to board ----------------------
  // Projects a live SmartSuggestion (from useSmartSuggestions) into a persisted
  // WhiteboardItem of type 'suggestion'. The hook's `subtitle` becomes the
  // on-board card's `body`; the original payload is preserved for deep links.
  const handleAddSuggestionToBoard = useCallback(
    async (suggestion: SmartSuggestion) => {
      // Pass card dimensions so viewport-center placement accounts for actual size
      const { x, y } = placementForNew(SUGGESTION_CARD_DEFAULT_SIZE.width, SUGGESTION_CARD_DEFAULT_SIZE.height);
      const content: WhiteboardSuggestionContent = {
        kind: suggestion.kind,
        title: suggestion.title,
        body: suggestion.subtitle ?? '',
        suggestion_id: suggestion.id,
        payload: suggestion.payload,
      };
      const created = await createItem({
        type: 'suggestion',
        position_x: x,
        position_y: y,
        width: SUGGESTION_CARD_DEFAULT_SIZE.width,
        height: SUGGESTION_CARD_DEFAULT_SIZE.height,
        content,
      });
      if (!created) {
        setSnackbar('Could not add to board. Check your connection.');
      } else {
        // Close the sidebar after a successful add so the agent sees the card land.
        setIntelligenceSidebarVisible(false);
      }
    },
    [createItem, placementForNew],
  );

  // --- Edit ---------------------------------------------------------------
  const handleSaveFromSheet = useCallback(
    (id: string, patch: { content: WhiteboardItem['content']; color?: string | null }) => {
      void updateItem(id, patch);
    },
    [updateItem],
  );

  // --- Inline checklist toggle (Move mode) --------------------------------
  const handleToggleChecklistEntry = useCallback(
    (itemId: string, entryId: string) => {
      const it = items.find((x) => x.id === itemId);
      if (!it || it.type !== 'checklist') return;
      const content = it.content as WhiteboardChecklistContent;
      const next: WhiteboardChecklistContent = {
        ...content,
        items: content.items.map((e) =>
          e.id === entryId ? { ...e, checked: !e.checked } : e,
        ),
      };
      void updateItem(itemId, { content: next });
    },
    [items, updateItem],
  );

  // --- Checklist "Done" affordance ----------------------------------------
  // Optimistic-delete + 5s Snackbar undo. Captures the full item shape before
  // deletion so Undo can recreate it at the same position with same content.
  const handleCompleteChecklist = useCallback(
    (id: string) => {
      const it = items.find((x) => x.id === id);
      if (!it) return;
      setUndoDeleteItem(it);
      void deleteItem(id);
    },
    [items, deleteItem],
  );

  const handleUndoDelete = useCallback(() => {
    if (!undoDeleteItem) return;
    void createItem({
      type: undoDeleteItem.type,
      position_x: undoDeleteItem.position_x,
      position_y: undoDeleteItem.position_y,
      width: undoDeleteItem.width,
      height: undoDeleteItem.height,
      content: undoDeleteItem.content,
      color: undoDeleteItem.color ?? undefined,
      // Preserve live-binding on undo. Today this only fires for completed
      // checklists (which carry no ref_id), but the path may be reused for
      // pinned contact/property/map widgets where ref_id matters.
      ref_id: undoDeleteItem.ref_id ?? null,
    });
    setUndoDeleteItem(null);
  }, [undoDeleteItem, createItem]);

  // --- Context menu actions -----------------------------------------------
  const handleDelete = useCallback(
    (id: string) => {
      void deleteItem(id);
    },
    [deleteItem],
  );

  const handleBringToFront = useCallback(
    (id: string) => {
      void bringToFront(id);
    },
    [bringToFront],
  );

  const handleChangeColor = useCallback(
    (id: string, color: string) => {
      void updateItem(id, { color });
    },
    [updateItem],
  );

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [router]);

  // Quick-arrange: tidy all items into a clean grid laid out top-left in the
  // world, then animate the camera to fit-all the new layout. Items are
  // ordered by `updated_at` desc so the freshest land in the top-left.
  //
  // Sizing assumes max widget bounds of 240×240 plus a 24pt gutter — items
  // smaller than that simply leave whitespace below themselves in their cell,
  // which reads cleanly. Column count scales toward sqrt(n) capped at 8 so
  // small boards stay tight and very large boards don't overflow the world's
  // 4000pt height (worst case 60 items × 8 cols → 8 rows × 264pt = 2112pt,
  // well within bounds).
  const handleQuickArrange = useCallback(() => {
    if (items.length === 0) return;
    const sorted = [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const COL_W = 240;
    const ROW_H = 240;
    const GUTTER = 24;
    const COLS = Math.min(8, Math.max(2, Math.ceil(Math.sqrt(sorted.length * 1.4))));
    const START = 80;

    sorted.forEach((item, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = START + col * (COL_W + GUTTER);
      const y = START + row * (ROW_H + GUTTER);
      // Optimistic-first updateItem persists in the background — the UI
      // updates immediately, the network catch-up runs concurrent.
      void updateItem(item.id, { position_x: x, position_y: y });
    });

    // Camera fit on the new layout. Computed in-place rather than calling
    // CanvasViewControls's handleFitAll because we need to fit on the layout
    // we JUST wrote (the items array hasn't re-rendered yet at this point).
    const totalRows = Math.ceil(sorted.length / COLS);
    const layoutW = COLS * COL_W + Math.max(0, COLS - 1) * GUTTER;
    const layoutH = totalRows * ROW_H + Math.max(0, totalRows - 1) * GUTTER;
    const PAD = 0.10;
    const fitScaleX = (screenW * (1 - PAD * 2)) / layoutW;
    const fitScaleY = (screenH * (1 - PAD * 2)) / layoutH;
    const next = Math.max(0.4, Math.min(2.0, Math.min(fitScaleX, fitScaleY)));
    const centerX = START + layoutW / 2;
    const centerY = START + layoutH / 2;
    cameraScale.value = withTiming(next, { duration: 300 });
    cameraX.value = withTiming(
      clampCameraTranslate(screenW / 2 - centerX * next, screenW, WORLD_WIDTH, next),
      { duration: 300 },
    );
    cameraY.value = withTiming(
      clampCameraTranslate(screenH / 2 - centerY * next, screenH, WORLD_HEIGHT, next),
      { duration: 300 },
    );
  }, [items, updateItem, cameraX, cameraY, cameraScale, screenW, screenH]);

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.canvasArea}>
        <WhiteboardCanvas
          items={items}
          cameraX={cameraX}
          cameraY={cameraY}
          cameraScale={cameraScale}
          onRequestEdit={(id) => setEditingId(id)}
          onRequestContext={(id) => setContextId(id)}
          onToggleChecklistEntry={handleToggleChecklistEntry}
          onDelete={handleDelete}
          onCompleteChecklist={handleCompleteChecklist}
        />

        {/* Minimap — bottom-right corner overlay */}
        <View style={styles.minimapOverlay} pointerEvents="box-none">
          <Minimap
            items={items}
            cameraX={cameraX}
            cameraY={cameraY}
            cameraScale={cameraScale}
            viewportW={screenW}
            viewportH={screenH}
          />
        </View>

        {/* Zoom / fit / reset controls — bottom-left corner */}
        <View style={styles.viewControlsOverlay} pointerEvents="box-none">
          <CanvasViewControls
            cameraX={cameraX}
            cameraY={cameraY}
            cameraScale={cameraScale}
            worldBounds={worldBounds}
            onQuickArrange={items.length > 0 ? handleQuickArrange : undefined}
            viewportW={screenW}
            viewportH={screenH}
          />
        </View>
      </View>

      <WhiteboardToolbar
        onRequestAdd={() => setAddSheetVisible(true)}
        onRequestSuggestions={() => setIntelligenceSidebarVisible(true)}
        onRequestOverview={() => setOverviewVisible(true)}
        onClose={handleClose}
      />

      <AddWidgetSheet
        visible={addSheetVisible}
        onDismiss={() => setAddSheetVisible(false)}
        onSelect={(type) => {
          void handleAddItem(type);
        }}
      />

      <EditItemSheet
        item={editingItem}
        onDismiss={() => setEditingId(null)}
        onSave={handleSaveFromSheet}
      />

      <ItemContextMenu
        item={contextItem}
        onDismiss={() => setContextId(null)}
        onDelete={handleDelete}
        onBringToFront={handleBringToFront}
        onChangeColor={handleChangeColor}
      />

      {/* Intelligence sidebar — always mounted so slide animation fires cleanly.
          Owns its own useSmartSuggestions call; whiteboard.tsx only wires visibility
          + the "add to board" handler (which owns placement logic). */}
      <IntelligenceSidebar
        visible={intelligenceSidebarVisible}
        onDismiss={() => setIntelligenceSidebarVisible(false)}
        onAddToBoard={handleAddSuggestionToBoard}
      />

      {/* Overview sheet — searchable list of all board items with tap-to-pan. */}
      <OverviewSheet
        visible={overviewVisible}
        items={items}
        cameraX={cameraX}
        cameraY={cameraY}
        cameraScale={cameraScale}
        onDismiss={() => setOverviewVisible(false)}
      />

      <Snackbar
        visible={!!undoDeleteItem}
        onDismiss={() => setUndoDeleteItem(null)}
        duration={5000}
        action={{ label: 'Undo', onPress: handleUndoDelete }}
      >
        Checklist removed
      </Snackbar>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar(null)}
        duration={3500}
      >
        {snackbar ?? ''}
      </Snackbar>

      {/* Surface store-level errors as a passive footer toast. */}
      <Snackbar
        visible={!!error && !snackbar}
        onDismiss={() => {
          /* store errors clear naturally on next successful action */
        }}
        duration={4000}
      >
        {error ?? ''}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  canvasArea: {
    flex: 1,
  },
  minimapOverlay: {
    position: 'absolute',
    bottom: 16,
    right: 12,
  },
  viewControlsOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 12,
  },
});
