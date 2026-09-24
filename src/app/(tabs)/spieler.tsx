import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useGroup, type Player } from '@/lib/group';
import { formatRating } from '@/lib/ratings';
import { strength } from '@/lib/teams';

export default function PlayersScreen() {
  const { players, playersLoaded, isAdmin, refreshPlayers } = useGroup();
  const myId = useAuth().session?.user.id;
  useFocusEffect(
    useCallback(() => {
      refreshPlayers().catch(() => {});
    }, [refreshPlayers])
  );
  const sorted = [...players].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'de')
  );

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.content}>
        {isAdmin ? (
          <BigButton
            title="+ Spieler hinzufügen"
            onPress={() => router.push('/spieler/neu')}
            style={styles.addButton}
          />
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.addButton}>
            Spieler anlegen und Stärken ändern können nur Admins.
          </ThemedText>
        )}
        <FlatList
          data={sorted}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PlayerRow player={item} isMe={!!myId && item.user_id === myId} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            playersLoaded ? (
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                Noch keine Spieler in dieser Gruppe.
              </ThemedText>
            ) : null
          }
        />
      </View>
    </ThemedView>
  );
}

function PlayerRow({ player, isMe }: { player: Player; isMe: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/profil/[id]', params: { id: player.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : player.active ? 1 : 0.5 },
      ]}>
      <View style={styles.rowText}>
        <ThemedText style={styles.name}>
          {player.name}
          {isMe ? ' (du)' : ''}
        </ThemedText>
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
