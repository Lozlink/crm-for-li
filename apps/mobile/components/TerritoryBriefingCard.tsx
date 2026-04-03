import { StyleSheet, View } from 'react-native';
import { Text, Portal, Dialog, Button, Chip, Surface, useTheme } from 'react-native-paper';
import type { TerritoryBriefing } from '@realestate-crm/types';

interface TerritoryBriefingCardProps {
  visible: boolean;
  onDismiss: () => void;
  briefing: TerritoryBriefing | null;
}

function formatPrice(price: number): string {
  if (price >= 1_000_000) {
    return `$${(price / 1_000_000).toFixed(1)}M`;
  }
  return `$${price.toLocaleString()}`;
}

function getActionColor(action: string): string {
  if (action.toLowerCase().includes('focus')) return '#22c55e';
  if (action.toLowerCase().includes('maintain')) return '#f59e0b';
  return '#9ca3af';
}

export default function TerritoryBriefingCard({ visible, onDismiss, briefing }: TerritoryBriefingCardProps) {
  const theme = useTheme();

  if (!briefing) return null;

  const actionColor = getActionColor(briefing.recommendedAction);

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{briefing.suburb}</Dialog.Title>
        <Dialog.Content>
          <Surface style={[styles.statsGrid, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
            <View style={styles.statCell}>
              <Text variant="labelSmall" style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
                Median Price
              </Text>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                {formatPrice(briefing.medianSalePrice)}
              </Text>
            </View>

            <View style={styles.statCell}>
              <Text variant="labelSmall" style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
                Days on Market
              </Text>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                {briefing.avgDaysOnMarket}
              </Text>
            </View>

            <View style={styles.statCell}>
              <Text variant="labelSmall" style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
                Penetration
              </Text>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                {briefing.penetrationPct.toFixed(1)}%
              </Text>
            </View>

            <View style={styles.statCell}>
              <Text variant="labelSmall" style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
                Contacts
              </Text>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                {briefing.contactCount}
              </Text>
            </View>

            <View style={[styles.statCell, styles.statCellWide]}>
              <Text variant="labelSmall" style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
                Recent Sales (90d)
              </Text>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                {briefing.recentSales}
              </Text>
            </View>
          </Surface>

          <View style={styles.actionRow}>
            <Chip
              style={[styles.actionChip, { backgroundColor: `${actionColor}20` }]}
              textStyle={{ color: actionColor, fontWeight: '600' }}
            >
              {briefing.recommendedAction}
            </Chip>
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Close</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  statCell: {
    width: '48%',
    paddingVertical: 8,
  },
  statCellWide: {
    width: '100%',
  },
  statLabel: {
    marginBottom: 2,
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  actionChip: {
    borderRadius: 20,
  },
});
