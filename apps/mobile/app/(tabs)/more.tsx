import { StyleSheet, View, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme, Text, Surface } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const ALL_ITEMS = [
  { label: 'Pipeline', icon: 'view-column', route: '/(tabs)/pipeline', color: '#6366f1' },
  { label: 'Campaigns', icon: 'email-multiple-outline', route: '/campaigns/', color: '#f59e0b' },
  { label: 'Routes', icon: 'map-marker-path', route: '/(tabs)/routes', color: '#10b981' },
  { label: 'Notes', icon: 'note-text-outline', route: '/(tabs)/notes', color: '#3b82f6' },
  { label: 'Reports', icon: 'chart-bar', route: '/(tabs)/stats', color: '#8b5cf6' },
];

export default function MoreScreen() {
  const theme = useTheme();
  const router = useRouter();

  // Build rows of 3
  const rows: (typeof ALL_ITEMS)[] = [];
  for (let i = 0; i < ALL_ITEMS.length; i += 3) {
    rows.push(ALL_ITEMS.slice(i, i + 3));
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((item) => (
            <TouchableOpacity
              key={item.label}
              onPress={() => router.push(item.route as never)}
              activeOpacity={0.7}
              style={styles.cardWrapper}
            >
              <Surface style={styles.card} elevation={1}>
                <View style={[styles.iconCircle, { backgroundColor: item.color + '18' }]}>
                  <Icon name={item.icon} size={24} color={item.color} />
                </View>
                <Text variant="labelMedium" style={{ marginTop: 8 }}>{item.label}</Text>
              </Surface>
            </TouchableOpacity>
          ))}
          {/* Fill empty slots so items don't stretch */}
          {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
            <View key={`spacer-${i}`} style={styles.cardWrapper} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  cardWrapper: { flex: 1 },
  card: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
