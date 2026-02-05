import { memo } from 'react';
import { StyleSheet, View, Share, Platform } from 'react-native';
import { Text, Surface, Button, useTheme, IconButton } from 'react-native-paper';
import type { Invitation } from '@realestate-crm/types';
import RoleBadge from './RoleBadge';

interface InviteCodeCardProps {
  invitation: Invitation;
}

function InviteCodeCard({ invitation }: InviteCodeCardProps) {
  const theme = useTheme();
  const deepLink = `realestate-crm://join?code=${invitation.invite_code}`;

  const handleCopy = async () => {
    // Use Share as a copy mechanism (works cross-platform without extra deps)
    await Share.share({ message: invitation.invite_code });
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my team on Real Estate CRM! Use invite code: ${invitation.invite_code}\n\nOr open this link: ${deepLink}`,
      });
    } catch {}
  };

  const expiresAt = new Date(invitation.expires_at);
  const isExpired = expiresAt < new Date();

  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.header}>
        <RoleBadge role={invitation.role} compact />
        {invitation.email && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
            {invitation.email}
          </Text>
        )}
      </View>

      <View style={styles.codeRow}>
        <Text variant="headlineSmall" style={[styles.code, { color: theme.colors.primary }]}>
          {invitation.invite_code}
        </Text>
        <IconButton icon="content-copy" size={20} onPress={handleCopy} />
      </View>

      <View style={styles.footer}>
        <Text variant="bodySmall" style={{ color: isExpired ? theme.colors.error : theme.colors.onSurfaceVariant }}>
          {isExpired ? 'Expired' : `Expires ${expiresAt.toLocaleDateString()}`}
        </Text>
        <Button mode="contained-tonal" compact onPress={handleShare} icon="share-variant">
          Share
        </Button>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

export default memo(InviteCodeCard);
