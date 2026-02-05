import { memo, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { Permission, TeamRole } from '@realestate-crm/types';
import { usePermissions } from '@realestate-crm/hooks';

interface RoleGuardProps {
  permission?: Permission;
  role?: TeamRole;
  children: ReactNode;
  fallback?: ReactNode;
}

function RoleGuard({ permission, role, children, fallback }: RoleGuardProps) {
  const { hasPermission, hasRole } = usePermissions();
  const theme = useTheme();

  const allowed = permission ? hasPermission(permission) : role ? hasRole(role) : true;

  if (!allowed) {
    if (fallback) return <>{fallback}</>;
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.surfaceVariant }]}>
        <Icon name="lock-outline" size={32} color={theme.colors.onSurfaceVariant} />
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
          You don't have permission to view this
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    borderRadius: 12,
    margin: 16,
  },
});

export default memo(RoleGuard);
