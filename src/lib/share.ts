import { Platform, Share } from 'react-native';

/**
 * Text teilen (WhatsApp & Co.). Browser am PC können oft nicht „teilen“ –
 * dann landet der Text in der Zwischenablage.
 */
export async function shareText(message: string): Promise<'shared' | 'copied' | 'failed'> {
  if (Platform.OS === 'web' && !navigator.share) {
    try {
      await navigator.clipboard.writeText(message);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  try {
    await Share.share({ message });
    return 'shared';
  } catch {
    return 'failed';
  }
}
