import { Image, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { WhiteboardItem, WhiteboardPhotoContent } from '@realestate-crm/types';

interface Props {
  item: WhiteboardItem;
  /** When true, shows the "replace photo" overlay (Edit mode). */
  editable?: boolean;
}

/**
 * Photo widget body.
 *
 * Design tokens (see DESIGN.md §7):
 * - 12pt outer corner, 8pt inner image corner
 * - Empty state: dashed border + image-plus icon + "Tap to add a photo"
 * - Filled state: cover image. In Edit mode shows camera-retake overlay at 40% opacity.
 */
export function PhotoCard({ item, editable = false }: Props) {
  const theme = useTheme();
  const content = item.content as WhiteboardPhotoContent | undefined;
  const uri = content?.local_uri ?? content?.url ?? null;
  const caption = (content?.caption ?? '').trim();
  const hasPhoto = Boolean(uri);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
    >
      {/* Image area */}
      <View
        style={[
          styles.imageWrap,
          !hasPhoto && styles.imageWrapEmpty,
          { backgroundColor: theme.colors.surfaceVariant },
          !hasPhoto && { borderColor: theme.colors.onSurfaceVariant },
        ]}
      >
        {hasPhoto ? (
          <>
            <Image source={{ uri: uri! }} style={styles.image} resizeMode="cover" />
            {/* Edit-mode overlay: replace affordance */}
            {editable && (
              <View style={styles.replaceOverlay} pointerEvents="none">
                <Icon
                  name="camera-retake-outline"
                  size={32}
                  color="#FFFFFF"
                />
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyState} pointerEvents="none">
            <Icon
              name="image-plus"
              size={32}
              color={theme.colors.onSurfaceVariant}
            />
            <Text
              variant="bodySmall"
              style={[styles.emptyLabel, { color: theme.colors.onSurfaceVariant }]}
            >
              Tap to add a photo
            </Text>
          </View>
        )}
      </View>

      {/* Caption (only shown when present) */}
      {caption.length > 0 && (
        <Text
          variant="bodySmall"
          numberOfLines={2}
          style={[styles.caption, { color: theme.colors.onSurfaceVariant }]}
        >
          {caption}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  imageWrap: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  // Dashed border for the empty state (simulated via borderStyle)
  imageWrapEmpty: {
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyLabel: {
    textAlign: 'center',
  },
  // Edit-mode replace overlay: centred icon at 40% opacity background
  replaceOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.40)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  caption: {
    marginTop: 6,
    marginHorizontal: 2,
  },
});
