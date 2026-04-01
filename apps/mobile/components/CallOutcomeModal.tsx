import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Modal, Portal, Text, Button, Surface, TextInput, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { PendingCallOutcome } from '@realestate-crm/hooks';
import type { CallOutcome } from '@realestate-crm/types';

interface CallOutcomeModalProps {
  pendingCall: PendingCallOutcome | null;
  onResolve: (outcome: CallOutcome, notes?: string) => void;
  onSkip: () => void;
}

type Step = 'connect' | 'not_connected_reason' | 'connected_details';

const NOT_CONNECTED_REASONS: { value: CallOutcome; label: string; icon: string }[] = [
  { value: 'no_answer', label: 'No Answer', icon: 'phone-missed' },
  { value: 'voicemail', label: 'Voicemail', icon: 'voicemail' },
  { value: 'wrong_number', label: 'Wrong Number', icon: 'phone-remove' },
  { value: 'busy', label: 'Busy', icon: 'phone-off' },
];

export default function CallOutcomeModal({
  pendingCall,
  onResolve,
  onSkip,
}: CallOutcomeModalProps) {
  const theme = useTheme();
  const [step, setStep] = useState<Step>('connect');
  const [notes, setNotes] = useState('');

  if (!pendingCall) return null;

  const callDirection =
    pendingCall.call.type === 'incoming'
      ? 'Incoming call'
      : pendingCall.call.type === 'outgoing'
        ? 'Outgoing call'
        : 'Missed call';

  const handleConnected = () => {
    setStep('connected_details');
  };

  const handleNotConnected = () => {
    setStep('not_connected_reason');
  };

  const handleNotConnectedReason = (reason: CallOutcome) => {
    onResolve(reason);
    resetState();
  };

  const handleSaveConnected = () => {
    onResolve('connected', notes.trim() || undefined);
    resetState();
  };

  const handleSkip = () => {
    onSkip();
    resetState();
  };

  const resetState = () => {
    setStep('connect');
    setNotes('');
  };

  return (
    <Portal>
      <Modal
        visible
        onDismiss={handleSkip}
        contentContainerStyle={[
          styles.container,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        {/* Contact info header — always shown */}
        <Surface style={[styles.callInfo, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
          <Text variant="bodyLarge" style={{ fontWeight: '600' }}>
            {pendingCall.contactName}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {callDirection} &middot; {pendingCall.call.phone}
          </Text>
        </Surface>

        {/* ── STEP 1: Did it connect? ── */}
        {step === 'connect' && (
          <>
            <View style={styles.header}>
              <Icon name="phone-log" size={28} color={theme.colors.primary} />
              <Text variant="titleMedium" style={styles.title}>
                Did the call connect?
              </Text>
            </View>

            <View style={styles.twoButtons}>
              <Button
                mode="contained"
                icon="phone-check"
                onPress={handleConnected}
                style={[styles.bigButton, { backgroundColor: '#10b981' }]}
                contentStyle={styles.bigButtonContent}
                labelStyle={styles.bigButtonLabel}
              >
                Connected
              </Button>
              <Button
                mode="contained"
                icon="phone-missed"
                onPress={handleNotConnected}
                style={[styles.bigButton, { backgroundColor: '#ef4444' }]}
                contentStyle={styles.bigButtonContent}
                labelStyle={styles.bigButtonLabel}
              >
                Not Connected
              </Button>
            </View>

            <Button mode="text" onPress={handleSkip} style={styles.skipButton}>
              Skip
            </Button>
          </>
        )}

        {/* ── STEP 2a: Not connected — pick reason ── */}
        {step === 'not_connected_reason' && (
          <>
            <View style={styles.header}>
              <Icon name="phone-missed" size={28} color="#ef4444" />
              <Text variant="titleMedium" style={styles.title}>
                What happened?
              </Text>
            </View>

            <View style={styles.options}>
              {NOT_CONNECTED_REASONS.map((option) => (
                <Button
                  key={option.value}
                  mode="outlined"
                  icon={option.icon}
                  onPress={() => handleNotConnectedReason(option.value)}
                  style={styles.optionButton}
                  contentStyle={styles.optionContent}
                >
                  {option.label}
                </Button>
              ))}
            </View>

            <Button
              mode="text"
              icon="arrow-left"
              onPress={() => setStep('connect')}
              style={styles.skipButton}
            >
              Back
            </Button>
          </>
        )}

        {/* ── STEP 2b: Connected — capture details ── */}
        {step === 'connected_details' && (
          <>
            <View style={styles.header}>
              <Icon name="phone-check" size={28} color="#10b981" />
              <Text variant="titleMedium" style={styles.title}>
                Call connected
              </Text>
            </View>

            <TextInput
              mode="outlined"
              label="Notes (optional)"
              placeholder="What was discussed?"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={styles.notesInput}
            />

            <Button
              mode="contained"
              icon="check"
              onPress={handleSaveConnected}
              style={[styles.saveButton, { backgroundColor: '#10b981' }]}
            >
              Save
            </Button>

            <Button
              mode="text"
              icon="arrow-left"
              onPress={() => setStep('connect')}
              style={styles.skipButton}
            >
              Back
            </Button>
          </>
        )}
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
  twoButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  bigButton: {
    flex: 1,
    borderRadius: 12,
  },
  bigButtonContent: {
    paddingVertical: 12,
  },
  bigButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
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
  notesInput: {
    marginBottom: 16,
  },
  saveButton: {
    borderRadius: 8,
  },
  skipButton: {
    marginTop: 8,
  },
});
