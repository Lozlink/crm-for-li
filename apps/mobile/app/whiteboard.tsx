import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Snackbar, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWhiteboardStore } from '@realestate-crm/hooks';
import type {
  WhiteboardChecklistContent,
  WhiteboardItem,
  WhiteboardItemType,
  WhiteboardPhotoContent,
  WhiteboardStickyContent,
} from '@realestate-crm/types';
import { WhiteboardCanvas } from '../components/whiteboard/WhiteboardCanvas';
import { WhiteboardToolbar } from '../components/whiteboard/WhiteboardToolbar';
import { EditItemSheet } from '../components/whiteboard/EditItemSheet';
import { ItemContextMenu } from '../components/whiteboard/ItemContextMenu';
import { AddWidgetSheet } from '../components/whiteboard/AddWidgetSheet';
import {
  CHECKLIST_DEFAULT_SIZE,
  ITEM_DEFAULT_SIZE,
  PHOTO_DEFAULT_SIZE,
  type WhiteboardMode,
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

  const [mode, setMode] = useState<WhiteboardMode>('move');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contextId, setContextId] = useState<string | null>(null);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const editingItem = useMemo<WhiteboardItem | null>(
    () => items.find((it) => it.id === editingId) ?? null,
    [items, editingId],
  );
  const contextItem = useMemo<WhiteboardItem | null>(
    () => items.find((it) => it.id === contextId) ?? null,
    [items, contextId],
  );

  // --- Add -----------------------------------------------------------------
  // Phase 1 placement: stagger new items in a small spiral so they don't
  // pile up on the same pixel. Future polish (designer): drop at viewport
  // center based on camera offset.
  const placementForNew = useCallback(() => {
    const n = items.length;
    const baseX = 40;
    const baseY = 80;
    const spread = 28;
    return {
      x: baseX + (n % 6) * spread,
      y: baseY + n * spread,
    };
  }, [items.length]);

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
      }
    },
    [createItem, mode, placementForNew],
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
          onRequestEdit={(id) => setEditingId(id)}
          onRequestContext={(id) => setContextId(id)}
          onToggleChecklistEntry={handleToggleChecklistEntry}
          onDelete={handleDelete}
        />
      </View>

      <WhiteboardToolbar
        mode={mode}
        onModeChange={setMode}
        onRequestAdd={() => setAddSheetVisible(true)}
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
