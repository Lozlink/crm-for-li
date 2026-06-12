import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Bottom spacing for sheets/previews anchored to the bottom of the window.
 *
 * Bottom-anchored UI (Paper `Modal` with `marginTop: 'auto'`, an absolutely
 * positioned sheet, a full-screen modal footer) sits on top of the Android
 * 3-button nav bar / iPhone home indicator and gets occluded there — the
 * established project pattern is that only tab screens inherit clearance from
 * the tab bar; everything else needs explicit `useSafeAreaInsets().bottom`
 * (see android-safe-area-bug).
 *
 * Returns `insets.bottom + minimum`, so the result is never smaller than the
 * caller's existing visual gap while still clearing whatever system inset the
 * device reports. On web (and on devices with no bottom inset) `insets.bottom`
 * is 0, so the value collapses to `minimum` and the layout is unchanged.
 *
 * @param minimum Floor for the returned spacing — the gap to keep even when the
 *   device reports a zero bottom inset. Defaults to 16.
 */
export function useBottomSheetPadding(minimum = 16): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + minimum;
}
