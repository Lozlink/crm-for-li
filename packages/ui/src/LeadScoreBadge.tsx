import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import type { LeadTier } from '@realestate-crm/types';

export const TIER_COLORS: Record<LeadTier, string> = {
  hot: '#ef4444',
  warm: '#f59e0b',
  cold: '#6366f1',
  dormant: '#9ca3af',
};

interface LeadScoreBadgeProps {
  score: number;
  tier: LeadTier;
  size?: 'small' | 'medium';
  showLabel?: boolean;
}

function LeadScoreBadge({ score, tier, size = 'small', showLabel = false }: LeadScoreBadgeProps) {
  const color = TIER_COLORS[tier];
  const isSmall = size === 'small';
  const label = showLabel || !isSmall
    ? `${score} ${tier.charAt(0).toUpperCase() + tier.slice(1)}`
    : `${score}`;

  return (
    <View
      style={[
        styles.badge,
        isSmall ? styles.badgeSmall : styles.badgeMedium,
        { backgroundColor: `${color}18`, borderColor: color },
      ]}
    >
      <Text
        style={[
          styles.text,
          isSmall ? styles.textSmall : styles.textMedium,
          { color },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeSmall: {
    height: 20,
    paddingHorizontal: 6,
  },
  badgeMedium: {
    height: 28,
    paddingHorizontal: 10,
  },
  text: {
    fontWeight: '700',
  },
  textSmall: {
    fontSize: 11,
  },
  textMedium: {
    fontSize: 13,
  },
});

export default memo(LeadScoreBadge);
