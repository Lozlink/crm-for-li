import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, Surface, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCRMStore } from '@realestate-crm/hooks';
import { ACTIVITY_TYPES, Activity } from '@realestate-crm/types';

interface ActivityFeedProps {
  contactId: string;
}

export default function ActivityFeed({ contactId }: ActivityFeedProps) {
  const theme = useTheme();
  const allActivities = useCRMStore(state => state.activities);
  const activities = useMemo(
    () => allActivities.filter(a => a.contact_id === contactId),
    [allActivities, contactId]
  );

  const getActivityIcon = (type: Activity['type']) => {
    const activityType = ACTIVITY_TYPES.find(t => t.value === type);
    return activityType?.icon || 'note-text';
  };

  const getActivityLabel = (type: Activity['type']) => {
    const activityType = ACTIVITY_TYPES.find(t => t.value === type);
    return activityType?.label || 'Note';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  if (activities.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="timeline-clock-outline" size={48} color={theme.colors.onSurfaceVariant} />
        <Text
          variant="bodyMedium"
          style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}
        >
          No activity yet
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
        >
          Add notes, calls, meetings, or emails to track your interactions
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {activities.map((activity, index) => (
        <View key={activity.id} style={styles.activityRow}>
          <View style={styles.timeline}>
            <View
              style={[
                styles.dot,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Icon name={getActivityIcon(activity.type)} size={12} color="#fff" />
            </View>
            {index < activities.length - 1 && (
              <View style={[styles.line, { backgroundColor: theme.colors.outlineVariant }]} />
            )}
          </View>

          <Surface style={styles.activityCard} elevation={1}>
            <View style={styles.activityHeader}>
              <Text variant="labelMedium" style={{ color: theme.colors.primary }}>
                {getActivityLabel(activity.type)}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {formatDate(activity.created_at || '')}
              </Text>
            </View>
            {activity.content && (
              <Text variant="bodyMedium" style={styles.content}>
                {activity.content}
              </Text>
            )}
          </Surface>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    marginTop: 12,
    marginBottom: 4,
  },
  activityRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  timeline: {
    width: 32,
    alignItems: 'center',
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  line: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  activityCard: {
    flex: 1,
    marginLeft: 8,
    padding: 12,
    borderRadius: 8,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  content: {
    marginTop: 4,
  },
});
