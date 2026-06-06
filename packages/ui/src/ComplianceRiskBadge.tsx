import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { ComplianceRiskLevel } from '@realestate-crm/types';

const RISK_LABELS: Record<ComplianceRiskLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

interface ComplianceRiskBadgeProps {
  score: number;
  level: ComplianceRiskLevel;
  size?: 'small' | 'medium';
  showLabel?: boolean;
}

/**
 * Compliance risk badge — mirrors LeadScoreBadge's bordered-pill look but
 * leads with a shield icon so the two badges read differently when they sit
 * side by side on a contact row. Low/medium reuse the green/amber palette
 * used across the app; high pulls from the theme so it tracks the dark-mode
 * error color like other warning surfaces.
 */
function ComplianceRiskBadge({ score, level, size = 'small', showLabel = false }: ComplianceRiskBadgeProps) {
  const theme = useTheme();
  const color =
    level === 'high' ? theme.colors.error : level === 'medium' ? '#f59e0b' : '#16a34a';
  const isSmall = size === 'small';
  const label = showLabel || !isSmall
    ? `${score} ${RISK_LABELS[level]} risk`
    : `${score}`;

  return (
    <View
      style={[
        styles.badge,
        isSmall ? styles.badgeSmall : styles.badgeMedium,
        { backgroundColor: `${color}18`, borderColor: color },
      ]}
    >
      <Icon name="shield" size={isSmall ? 10 : 12} color={color} style={styles.icon} />
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
  icon: {
    marginRight: 3,
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

export default memo(ComplianceRiskBadge);
