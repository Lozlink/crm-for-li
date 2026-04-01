import { StyleSheet, View } from 'react-native';
import { Modal, Portal, Text, Button, Surface, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { PendingCallOutcome } from '@realestate-crm/hooks';
import type { CallOutcome } from '@realestate-crm/types';

interface CallOutcomeModalProps {
  pendingCall: PendingCallOutcome | null;
  onSelect: (outcome: CallOutcome) => void;
  onSkip: () => void;
}

const OUTCOME_OPTIONS: { value: CallOutcome; label: string; icon: string }[] = [
  { value: 'connected', label: 'Connected', icon: 'phone-check' },
  { value: 'no_answer', label: 'No Answer', icon: 'phone-missed' },
  { value: 'voicemail', label: 'Voicemail', icon: 'voicemail' },
  { value: 'wrong_number', label: 'Wrong Number', icon: 'phone-remove' },
  { value: 'busy', label: 'Busy', icon: 'phone-off' },
];

export default function CallOutcomeModal({
  pendingCall,
  onSelect,
  onSkip,
}: CallOutcomeModalProps) {
  const theme = useTheme();

  if (!pendingCall) return null;

  const callDirection =
    pendingCall.call.type === 'incoming'
      ? 'Incoming call'
      : pendingCall.call.type === 'outgoing'
        ? 'Outgoing call'
        : 'Missed call';

  return (
    <Portal>
      <Modal
        visible
        onDismiss={onSkip}
        contentContainerStyle={[
          styles.container,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <View style={styles.header}>
          <Icon name="phone-log" size={28} color={theme.colors.primary} />
          <Text variant="titleMedium" style={styles.title}>
            How did the call go?
          </Text>
        </View>

        <Surface style={[styles.callInfo, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
          <Text variant="bodyLarge" style={{ fontWeight: '600' }}>
            {pendingCall.contactName}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {callDirection} &middot; {pendingCall.call.phone}
          </Text>
        </Surface>

        <View style={styles.options}>
          {OUTCOME_OPTIONS.map((option) => (
            <Button
              key={option.value}
              mode="outlined"
              icon={option.icon}
              onPress={() => onSelect(option.value)}
              style={styles.optionButton}
              contentStyle={styles.optionContent}
            >
              {option.label}
            </Button>
          ))}
        </View>

        <Button
          mode="text"
          onPress={onSkip}
          style={styles.skipButton}
        >
          Skip
        </Button>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 20,
    padding: 24,
    borderRadius: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  title: {
    flex: 1,
  },
  callInfo: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  options: {
    gap: 8,
  },
  optionButton: {
    borderRadius: 8,
  },
  optionContent: {
    justifyContent: 'flex-start',
    paddingVertical: 4,
  },
  skipButton: {
    marginTop: 8,
  },
});
