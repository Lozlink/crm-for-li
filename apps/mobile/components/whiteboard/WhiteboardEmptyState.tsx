import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

/**
 * Empty board placeholder. DESIGN.md §9.
 * Center of canvas, shown when no items exist yet.
 */
export function WhiteboardEmptyState() {
  const theme = useTheme();
  return (
    <View style={styles.root} pointerEvents="none">
      <Icon
        name="draw"
        size={64}
        color={theme.colors.onSurfaceVariant}
        style={{ opacity: 0.6 }}
      />
      <Text
        variant="headlineSmall"
        style={[styles.heading, { color: theme.colors.onSurfaceVariant }]}
      >
        Your board is blank
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.sub, { color: theme.colors.onSurfaceVariant }]}
      >
        Tap + to drop a quick note, photo, or to-do.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  heading: {
    textAlign: 'center',
  },
  sub: {
    textAlign: 'center',
    opacity: 0.7,
  },
});
