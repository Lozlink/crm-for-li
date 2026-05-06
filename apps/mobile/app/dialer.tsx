import { useCallback, useState } from 'react';
import { Linking, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

// Defensive gate: `expo-clipboard` is a native module added this sprint, so it
// won't be present in app builds that pre-date the rebuild. A static import
// would crash the screen at module-load. Falling back to a conditional require
// lets the dialer mount cleanly without paste support; the Paste button is
// rendered only when the module is present, and re-appears automatically once
// a rebuild lands. Same pattern documented in `native-module-rebuild-gotcha.md`.
type ClipboardModule = typeof import('expo-clipboard');
let Clipboard: ClipboardModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Clipboard = require('expo-clipboard') as ClipboardModule;
} catch {
  // Native module not linked yet — Paste button stays hidden until next rebuild.
}
import { IconButton, Snackbar, Surface, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';

// Keypad layout: 4 rows × 3 columns.
const KEYS: Array<{ label: string; sub?: string }> = [
  { label: '1' },                  { label: '2', sub: 'ABC' }, { label: '3', sub: 'DEF' },
  { label: '4', sub: 'GHI' },      { label: '5', sub: 'JKL' }, { label: '6', sub: 'MNO' },
  { label: '7', sub: 'PQRS' },     { label: '8', sub: 'TUV' }, { label: '9', sub: 'WXYZ' },
  { label: '*' },                  { label: '0', sub: '+' },   { label: '#' },
];

/**
 * Basic progressive phone number formatter.
 * Handles Australian mobile (04XX XXX XXX) and landline ((0X) XXXX XXXX),
 * falls back to groups of 3 for anything else.
 */
function formatDisplay(digits: string): string {
  if (digits.length === 0) return '';
  // Australian mobile: starts with 04, total 10 digits.
  if (digits.startsWith('04') && digits.length <= 10) {
    const a = digits.slice(0, 4);
    const b = digits.slice(4, 7);
    const c = digits.slice(7, 10);
    return [a, b, c].filter(Boolean).join(' ');
  }
  // Australian landline: starts with 0 (not 04), total 10 digits.
  if (digits.startsWith('0') && !digits.startsWith('04') && digits.length <= 10) {
    const area = digits.slice(0, 2);
    const b = digits.slice(2, 6);
    const c = digits.slice(6, 10);
    const parts = [`(${area})`];
    if (b) parts.push(b);
    if (c) parts.push(c);
    return parts.join(' ');
  }
  // Fallback: space every 3 digits.
  return digits.match(/.{1,3}/g)?.join(' ') ?? digits;
}

function cleanNumber(raw: string): string {
  return raw.replace(/[^\d+]/g, '');
}

export default function DialerScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();

  const [digits, setDigits] = useState('');
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const appendDigit = useCallback((d: string) => {
    setDigits((prev) => (prev.length < 15 ? prev + d : prev));
  }, []);

  const handleBackspace = useCallback(() => {
    setDigits((prev) => prev.slice(0, -1));
  }, []);

  const handleClearAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDigits('');
  }, []);

  const handlePaste = useCallback(async () => {
    // Gated on Clipboard being present — the button is also gated below, so this
    // is belt-and-suspenders against any future code path firing the handler.
    if (!Clipboard) return;
    const text = await Clipboard.getStringAsync();
    const cleaned = cleanNumber(text).slice(0, 15);
    if (cleaned.length > 0) {
      setDigits(cleaned);
    } else {
      setSnackbar('Nothing useful on the clipboard.');
    }
  }, []);

  const handleCall = useCallback(async () => {
    const number = `tel:${digits}`;
    // Don't pre-check via Linking.canOpenURL. On iOS it requires `tel` to be
    // in `LSApplicationQueriesSchemes` and returns false otherwise; on Android
    // 11+ it requires an `<intent>` query in the manifest. Both can return
    // false even though `openURL` would succeed — false-negative blocking the
    // user from calling. Just try `openURL` and catch the error if it fails.
    try {
      await Linking.openURL(number);
    } catch (e) {
      setSnackbar('Could not open the dialer. Try again or use a contact.');
      // Surface the underlying error in the dev console so we can diagnose
      // genuine failures (no SIM, sandbox, etc.) without showing them to users.
      if (__DEV__) console.warn('Linking.openURL(tel:) failed:', e);
    }
  }, [digits]);

  const callDisabled = digits.length < 3;

  // Long-press on backspace clears all.
  const longPressBackspace = Gesture.LongPress()
    .minDuration(600)
    .runOnJS(true)
    .onStart(handleClearAll);

  const keySize = Math.floor((screenW - 48) / 3);

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.root, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <IconButton
          icon="close"
          size={24}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/more' as never))}
          accessibilityLabel="Close dialer"
          style={styles.closeBtn}
        />
        <Text variant="titleMedium" style={styles.headerTitle}>Dialer</Text>
        <View style={styles.closeBtn} />
      </View>

      {/* Number display */}
      <View style={styles.displayArea}>
        <Text
          style={[
            styles.displayText,
            { color: theme.colors.onBackground },
            digits.length === 0 && { color: theme.colors.onSurfaceVariant },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {digits.length > 0 ? formatDisplay(digits) : 'Enter a number'}
        </Text>
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {KEYS.map((key) => (
          <TouchableRipple
            key={key.label}
            onPress={() => appendDigit(key.label)}
            borderless
            style={[styles.keyBtn, { width: keySize, height: keySize }]}
            accessibilityLabel={key.label}
          >
            <View style={styles.keyInner}>
              <Text style={[styles.keyDigit, { color: theme.colors.onSurface }]}>
                {key.label}
              </Text>
              {key.sub ? (
                <Text style={[styles.keySub, { color: theme.colors.onSurfaceVariant }]}>
                  {key.sub}
                </Text>
              ) : null}
            </View>
          </TouchableRipple>
        ))}
      </View>

      {/* Action row: backspace | call | paste */}
      <Surface style={[styles.actionRow, { backgroundColor: theme.colors.surface }]} elevation={0}>
        {/* Backspace — tap for single delete, long-press to clear all */}
        <GestureDetector gesture={longPressBackspace}>
          <TouchableRipple
            onPress={handleBackspace}
            borderless
            style={styles.actionBtn}
            accessibilityLabel="Backspace"
          >
            <Icon name="backspace-outline" size={28} color={theme.colors.onSurface} />
          </TouchableRipple>
        </GestureDetector>

        {/* Call */}
        <TouchableRipple
          onPress={handleCall}
          disabled={callDisabled}
          borderless
          style={[
            styles.callBtn,
            { backgroundColor: callDisabled ? theme.colors.surfaceVariant : '#22C55E' },
          ]}
          accessibilityLabel="Call"
          accessibilityRole="button"
        >
          <Icon
            name="phone"
            size={30}
            color={callDisabled ? theme.colors.onSurfaceVariant : '#fff'}
          />
        </TouchableRipple>

        {/* Paste from clipboard — only rendered if expo-clipboard is linked.
            On pre-rebuild app builds the button is hidden; reappears post-rebuild. */}
        {Clipboard ? (
          <TouchableRipple
            onPress={handlePaste}
            borderless
            style={styles.actionBtn}
            accessibilityLabel="Paste number from clipboard"
          >
            <Icon name="clipboard-text-outline" size={28} color={theme.colors.onSurface} />
          </TouchableRipple>
        ) : null}
      </Surface>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar(null)}
        duration={3000}
      >
        {snackbar ?? ''}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  headerTitle: {
    fontWeight: '700',
  },
  closeBtn: {
    width: 48,
  },
  displayArea: {
    width: '100%',
    paddingHorizontal: 24,
    paddingVertical: 24,
    alignItems: 'center',
    minHeight: 80,
    justifyContent: 'center',
  },
  displayText: {
    fontSize: 36,
    fontWeight: '300',
    letterSpacing: 2,
    textAlign: 'center',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 4,
  },
  keyBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 100,
    overflow: 'hidden',
  },
  keyInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDigit: {
    fontSize: 26,
    fontWeight: '300',
    lineHeight: 32,
  },
  keySub: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.5,
    lineHeight: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: 20,
    paddingHorizontal: 40,
    marginTop: 8,
  },
  actionBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  callBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
