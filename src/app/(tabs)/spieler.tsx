import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRating, useStore, type Player } from '@/lib/store';
import { strength } from '@/lib/teams';

export default function PlayersScreen() {
  const { players, loaded } = useStore();
  const sorted = [...players].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'de')
  );

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.content}>
        <BigButton
          title="+ Spieler hinzufügen"
          onPress={() => router.push('/spieler/neu')}
          style={styles.addButton}
        />
        <FlatList
          data={sorted}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PlayerRow player={item} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            loaded ? (
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                Noch keine Spieler. Leg zuerst alle an, die bei euch mitspielen.
              </ThemedText>
            ) : null
          }
        />
      </View>
    </ThemedView>
  );
}

function PlayerRow({ player }: { player: Player }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/spieler/[id]', params: { id: player.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : player.active ? 1 : 0.5 },
      ]}>
      <View style={styles.rowText}>
        <ThemedText style={styles.name}>{player.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Abwehr {formatRating(player.defense)} · Angriff {formatRating(player.attack)}
          {player.active ? '' : ' · inaktiv'}
        </ThemedText>
      </View>
      <ThemedText style={styles.total}>{formatRating(strength(player))}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  content: { flex: 1, width: '100%', maxWidth: MaxContentWidth, padding: Spacing.three },
  addButton: { marginBottom: Spacing.three },
  list: { gap: Spacing.two, paddingBottom: Spacing.five },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 14,
  },
  rowText: { flex: 1 },
  name: { fontSize: 18, fontWeight: 700 },
  total: { fontSize: 22, fontWeight: 700 },
});
