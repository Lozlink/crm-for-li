import { useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme, Text, Surface } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useComplianceStore } from '@realestate-crm/hooks';

const SECTIONS = [
  {
    title: 'Manage',
    items: [
      { label: 'Pipeline', icon: 'view-column', route: '/(tabs)/pipeline', color: '#6366f1' },
      { label: 'Properties', icon: 'home-city', route: '/(tabs)/properties', color: '#3b82f6' },
      { label: 'Tasks', icon: 'checkbox-marked-circle-outline', route: '/(tabs)/tasks', color: '#f59e0b' },
    ],
  },
  {
    title: 'Field Work',
    items: [
      { label: 'Sessions', icon: 'map-marker-path', route: '/(tabs)/prospecting', color: '#10b981' },
      { label: 'Notes', icon: 'note-text-outline', route: '/(tabs)/notes', color: '#6366f1' },
      { label: 'Whiteboard', icon: 'draw', route: '/whiteboard', color: '#a855f7' },
      { label: 'Campaigns', icon: 'email-multiple-outline', route: '/campaigns', color: '#ec4899' },
      { label: 'Dialer', icon: 'dialpad', route: '/dialer', color: '#14b8a6' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { label: 'Reports', icon: 'chart-bar', route: '/(tabs)/stats', color: '#8b5cf6' },
      { label: 'Settings', icon: 'cog-outline', route: '/(tabs)/settings', color: '#6b7280' },
    ],
  },
];

// Opt-in Compliance Suite group — only shown while the suite toggle is on
// (Settings → Compliance Suite), keeping zero compliance footprint otherwise.
const COMPLIANCE_SECTION = {
  title: 'Compliance',
  items: [
    { label: 'Compliance', icon: 'shield-check', route: '/(tabs)/compliance', color: '#0ea5e9' },
  ],
};

export default function MoreScreen() {
  const theme = useTheme();
  const router = useRouter();

  const suiteEnabled = useComplianceStore((s) => s.suiteEnabled);
  const sections = useMemo(
    () => (suiteEnabled ? [...SECTIONS.slice(0, 2), COMPLIANCE_SECTION, ...SECTIONS.slice(2)] : SECTIONS),
    [suiteEnabled],
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      {sections.map((section) => (
        <View key={section.title} style={styles.sectionBlock}>
          <Text variant="labelMedium" style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>
            {section.title}
          </Text>
          {/* Grid wraps when a section has more than 3 items (Field Work has
              5). Previously a single flex-row with flex:1 cardWrapper crammed
              all 5 into one row, which broke "Sessions/Whiteboard/Campaigns"
              into mid-word splits. With flex-wrap and a fixed-percent card
              width, each card stays wide enough for the full label. */}
          <View style={styles.row}>
            {section.items.map((item) => (
              <TouchableOpacity
                key={item.label}
                onPress={() => router.push(item.route as never)}
                activeOpacity={0.7}
                style={styles.cardWrapper}
              >
                <Surface style={styles.card} elevation={1}>
                  <View style={[styles.iconCircle, { backgroundColor: item.color + '14' }]}>
                    <Icon name={item.icon} size={24} color={item.color} />
                  </View>
                  <Text
                    variant="labelMedium"
                    numberOfLines={1}
                    style={{ marginTop: 8 }}
                  >
                    {item.label}
                  </Text>
                </Surface>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12, paddingBottom: 40 },
  sectionBlock: { marginBottom: 16 },
  sectionTitle: { marginBottom: 8, marginLeft: 4, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // 31% width gives 3 cards per row at iPhone widths (3×31% = 93% + 2 gaps).
  // Sections with 5 items (Field Work) wrap onto a second row with 3+2 layout.
  // Sections with fewer than 3 (Insights = 2) flow naturally without spacers.
  cardWrapper: { width: '31%' },
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
