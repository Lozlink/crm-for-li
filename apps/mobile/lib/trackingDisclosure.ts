import { Alert } from 'react-native';
import { storage } from '@realestate-crm/utils';

const TRACKING_DISCLOSURE_KEY = 'tracking_disclosure_ack_v1';

/**
 * Background-location disclosure, shown ONCE per install before the first
 * tracking session (App Store prominent-disclosure requirement). After the
 * user accepts, sessions start immediately — the per-start confirm dialog
 * this replaces was pure friction in the core field loop.
 *
 * Gate every `startSession()` call site with this:
 *   if (!(await ensureTrackingDisclosure())) return;
 */
export async function ensureTrackingDisclosure(): Promise<boolean> {
  const acknowledged = await storage.getItem(TRACKING_DISCLOSURE_KEY);
  if (acknowledged) return true;
  return new Promise(resolve => {
    Alert.alert(
      'Location tracking',
      'Prospecting sessions record your location in the background to map doors knocked, distance covered, and field notes. You won’t be asked again.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Got it',
          onPress: () => {
            void storage.setItem(TRACKING_DISCLOSURE_KEY, new Date().toISOString());
            resolve(true);
          },
        },
      ],
    );
  });
}
