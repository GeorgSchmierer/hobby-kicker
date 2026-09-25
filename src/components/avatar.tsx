import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { avatarColor, initials, useAvatarUrl } from '@/lib/avatars';

/** Rundes Spielerbild: Foto, sonst farbiger Kreis mit Initialen */
export function Avatar({
  name,
  path,
  size = 36,
}: {
  name: string;
  path?: string | null;
  size?: number;
}) {
  const url = useAvatarUrl(path);
  const circle = { width: size, height: size, borderRadius: size / 2 };
  if (url) {
    return <Image source={{ uri: url }} style={circle} contentFit="cover" accessibilityLabel={name} />;
  }
  return (
    <View
      accessibilityLabel={name}
      style={[styles.center, circle, { backgroundColor: avatarColor(name) }]}>
      <Text style={[styles.text, { fontSize: size * 0.4 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF', fontWeight: '800' },
});
