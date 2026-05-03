import { StyleSheet, View } from 'react-native';
import { Text, Portal, Dialog, Button, ProgressBar, useTheme } from 'react-native-paper';
import type { LeadScoreBreakdown } from '@realestate-crm/types';
import LeadScoreBadge, { TIER_COLORS } from './LeadScoreBadge';

interface ScoreBreakdownSheetProps {
  visible: boolean;
  onDismiss: () => void;
  breakdown: LeadScoreBreakdown | null;
}

const COMPONENTS: { key: keyof LeadScoreBreakdown['components']; label: string; max: number }[] = [
  { key: 'staleness', label: 'Freshness', max: 25 },
  { key: 'salesMomentum', label: 'Market Activity', max: 25 },
  { key: 'engagement', label: 'Engagement', max: 25 },
  { key: 'streetConversion', label: 'Street Success', max: 15 },
  { key: 'penetration', label: 'Opportunity', max: 10 },
  { key: 'buildingCoverage', label: 'Building Momentum', max: 8 },
];

export default function ScoreBreakdownSheet({ visible, onDismiss, breakdown }: ScoreBreakdownSheetProps) {
  const theme = useTheme();

  if (!breakdown) return null;

  const tierColor = TIER_COLORS[breakdown.tier];

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>Lead Score Breakdown</Dialog.Title>
        <Dialog.Content>
          <View style={styles.totalRow}>
            <LeadScoreBadge score={breakdown.total} tier={breakdown.tier} size="medium" />
            <Text
              variant="bodySmall"
              style={[styles.computedAt, { color: theme.colors.onSurfaceVariant }]}
            >
              Last updated: {new Date(breakdown.lastComputedAt).toLocaleDateString()}
            </Text>
          </View>

          <View style={styles.componentsContainer}>
            {COMPONENTS.map(({ key, label, max }) => {
              const value = breakdown.components[key];
              return (
                <View key={key} style={styles.componentRow}>
                  <View style={styles.componentHeader}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>
                      {label}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {value}/{max}
                    </Text>
                  </View>
                  <ProgressBar
                    progress={value / max}
                    color={tierColor}
                    style={styles.progressBar}
                  />
                </View>
              );
            })}
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
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  computedAt: {
    fontSize: 11,
  },
  componentsContainer: {
    gap: 14,
  },
  componentRow: {
    gap: 4,
  },
  componentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
});
