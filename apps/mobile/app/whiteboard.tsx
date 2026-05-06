import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Snackbar, useTheme, Dialog, Button, Portal } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import { useWhiteboardStore } from '@realestate-crm/hooks';
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
import {
  CHECKLIST_DEFAULT_SIZE,
  ITEM_DEFAULT_SIZE,
  PHOTO_DEFAULT_SIZE,
  SUGGESTION_CARD_DEFAULT_SIZE,
  type SmartSuggestion,
  type WhiteboardMode,
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

  const [mode, setMode] = useState<WhiteboardMode>('move');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contextId, setContextId] = useState<string | null>(null);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [intelligenceSidebarVisible, setIntelligenceSidebarVisible] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  // Pending checklist completion — holds the item id until user confirms removal.
  const [completeConfirmId, setCompleteConfirmId] = useState<string | null>(null);

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
        } else if (mode === 'edit') {
          // Sticky text is inline-editable; no dialog needed.
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
    [createItem, mode, placementForNew],
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
  const handleCompleteChecklist = useCallback(
    (id: string) => {
      setCompleteConfirmId(id);
    },
    [],
  );

  const handleConfirmComplete = useCallback(() => {
    if (completeConfirmId) {
      void deleteItem(completeConfirmId);
      setCompleteConfirmId(null);
    }
  }, [completeConfirmId, deleteItem]);

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

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.canvasArea}>
        <WhiteboardCanvas
          items={items}
          mode={mode}
          cameraX={cameraX}
          cameraY={cameraY}
          cameraScale={cameraScale}
          onRequestEdit={(id) => setEditingId(id)}
          onRequestContext={(id) => setContextId(id)}
          onToggleChecklistEntry={handleToggleChecklistEntry}
          onDelete={handleDelete}
          onCompleteChecklist={handleCompleteChecklist}
        />
      </View>

      <WhiteboardToolbar
        mode={mode}
        onModeChange={setMode}
        onRequestAdd={() => setAddSheetVisible(true)}
        onRequestSuggestions={() => setIntelligenceSidebarVisible(true)}
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

      {/* Checklist completion confirm dialog.
          Hard-delete has no undo — Dialog gives one deliberate tap to confirm.
          TODO: replace with Snackbar + Undo for a smoother UX (requires capturing
          the deleted item's content/position for recreation). */}
      <Portal>
        <Dialog
          visible={!!completeConfirmId}
          onDismiss={() => setCompleteConfirmId(null)}
        >
          <Dialog.Title>Remove completed list?</Dialog.Title>
          <Dialog.Actions>
            <Button onPress={() => setCompleteConfirmId(null)}>Keep</Button>
            <Button mode="contained" onPress={handleConfirmComplete}>Remove</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

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
});
