import { View, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { CustomFieldAdmin } from '@realestate-crm/ui';

export default function CustomFieldsScreen() {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <CustomFieldAdmin />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
