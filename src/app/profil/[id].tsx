import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { BigButton, SmallButton } from '@/components/controls';
import { ErrorText } from '@/components/form';
import { FormChips, StrengthChart } from '@/components/stats';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { pickAndUploadAvatar, removeAvatar } from '@/lib/avatars';
import { useGroup } from '@/lib/group';
import { todayIso, useGroupStats } from '@/lib/group-stats';
import { formatRating } from '@/lib/ratings';
import {
  attendance,
  awards,
  dreamPartner,
  favouriteOpponent,
  nemesis,
  strengthHistory,
  summarize,
  type PairStat,
} from '@/lib/stats';
import { badgeEmoji, badgeHint, badgeTitle, loadPlayerBadges, type Badge } from '@/lib/badges';
import { formatDate } from '@/lib/sessions';
import { loadStandings, type StandingRow } from '@/lib/standings';
import { errorMessage } from '@/lib/supabase';
import { strength } from '@/lib/teams';

export default function ProfileScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { current, players, isAdmin, refreshPlayers } = useGroup();
  const { stats, error } = useGroupStats(current?.id);
  const player = players.find((p) => p.id === id);
  const myId = useAuth().session?.user.id;
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  if (!player) {
    return (
      <ThemedView style={[styles.screen, styles.center]}>
        <ThemedText>Diesen Spieler gibt es nicht (mehr).</ThemedText>
      </ThemedView>
    );
  }

  const name = (pid: string) => players.find((p) => p.id === pid)?.name ?? '?';
  // Foto ändern dürfen Admins und der Spieler selbst (verknüpftes Konto)
  const canEditPhoto = isAdmin || (!!myId && player.user_id === myId);
  const changePhoto = async (remove: boolean) => {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const target = { ...player, group_id: current!.id };
      const changed = remove ? (await removeAvatar(target), true) : await pickAndUploadAvatar(target);
      if (changed) await refreshPlayers();
    } catch (e) {
      setPhotoError(errorMessage(e));
    } finally {
      setPhotoBusy(false);
    }
  };
  const pct = (v: number) => `${Math.round(v * 100)} %`;

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: player.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Kopf: Stärke */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.row}>
            <Avatar name={player.name} path={player.avatar_path} size={64} />
            <View style={styles.flex}>
              <ThemedText style={styles.bigName}>{player.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Abwehr {formatRating(player.defense)} · Angriff {formatRating(player.attack)}
                {player.active ? '' : ' · inaktiv'}
              </ThemedText>
            </View>
            <View style={styles.strengthBox}>
              <ThemedText style={[styles.strength, { color: theme.primary }]}>
                {formatRating(strength(player))}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Stärke
              </ThemedText>
            </View>
          </View>
          {canEditPhoto && (
            <View style={styles.photoRow}>
              <SmallButton
                title={photoBusy ? 'Wird hochgeladen …' : player.avatar_path ? '📷 Foto ändern' : '📷 Foto hinzufügen'}
                disabled={photoBusy}
                onPress={() => changePhoto(false)}
              />
              {player.avatar_path && (
                <SmallButton title="Foto entfernen" disabled={photoBusy} onPress={() => changePhoto(true)} />
              )}
            </View>
          )}
          <ErrorText message={photoError} />
          {isAdmin && (
            <BigButton
              title="✏️ Bearbeiten"
              variant="secondary"
              style={[styles.outlined, { borderColor: theme.border }]}
              onPress={() => router.push({ pathname: '/spieler/[id]', params: { id: player.id } })}
            />
          )}
        </ThemedView>

        <ErrorText message={error ? errorMessage(error) : null} />
        {!stats ? (
          <ActivityIndicator color={theme.primary} />
        ) : (
          <ProfileStats
            groupId={current!.id}
            playerId={player.id}
            stats={stats}
            name={name}
            pct={pct}
            playerIds={players.map((p) => p.id)}
          />
        )}
      </ScrollView>
    </ThemedView>
  );
}

function ProfileStats({
  groupId,
  playerId,
  stats,
  name,
  pct,
  playerIds,
}: {
  groupId: string;
  playerId: string;
  stats: NonNullable<ReturnType<typeof useGroupStats>['stats']>;
  name: (id: string) => string;
  pct: (v: number) => string;
  playerIds: string[];
}) {
  const s = summarize(stats.games, playerId);
  const history = strengthHistory(stats.changes, playerId);
  const duo = dreamPartner(stats.games, playerId);
  const enemy = nemesis(stats.games, playerId);
  const victim = favouriteOpponent(stats.games, playerId);
  const myAwards = awards(
    stats.games,
    playerIds,
    stats.changes.map((c) => ({ playerId: c.playerId, playedOn: c.playedOn, delta: c.after - c.before })),
    todayIso(),
    stats.mvp
  ).filter((a) => a.playerId === playerId);
  const mvpCount = stats.mvp.get(playerId) ?? 0;
  // Platz in der Gesamttabelle (Punkte rechnet der Server)
  const [eternal, setEternal] = useState<StandingRow[]>([]);
  useFocusEffect(
    useCallback(() => {
      loadStandings(groupId, { key: 'all', label: 'Gesamt', from: null, to: null })
        .then(setEternal)
        .catch(() => setEternal([]));
    }, [groupId])
  );
  const eternalPlace = eternal.findIndex((r) => r.playerId === playerId);
  // Abzeichen (TODO C3), vergeben vom Server
  const [badges, setBadges] = useState<Badge[]>([]);
  useFocusEffect(
    useCallback(() => {
      loadPlayerBadges(playerId)
        .then(setBadges)
        .catch(() => setBadges([]));
    }, [playerId])
  );
  // Anwesenheit (TODO C6): dieses Jahr und insgesamt
  const thisYear = todayIso().slice(0, 4);
  const presentYear = attendance(stats.sessions, [playerId], thisYear)[0];
  const presentAll = attendance(stats.sessions, [playerId])[0];
  // Letzte Wertungsänderungen mit Begründung (TODO C5), neueste zuerst
  const recentReasons = stats.explained
    .filter((e) => e.playerId === playerId)
    .sort((a, b) => b.seq - a.seq)
    .slice(0, 5);

  if (s.played === 0 && mvpCount === 0) {
    return (
      <ThemedText themeColor="textSecondary" style={styles.centerText}>
        Noch keine gewerteten Spiele. Nach dem ersten Ergebnis gibt es hier Statistiken.
      </ThemedText>
    );
  }

  const streakText =
    s.streak && s.streak.length >= 2
      ? s.streak.outcome === 'W'
        ? `🔥 ${s.streak.length} Siege in Folge`
        : s.streak.outcome === 'L'
          ? `🌧 ${s.streak.length} Niederlagen in Folge`
          : `🤝 ${s.streak.length}× unentschieden in Folge`
      : null;

  return (
    <>
      {myAwards.length > 0 && (
        <View style={styles.badges}>
          {myAwards.map((a) => (
            <ThemedView key={a.title} type="backgroundSelected" style={styles.badge}>
              <ThemedText style={styles.badgeText}>
                {a.emoji} {a.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {a.detail}
              </ThemedText>
            </ThemedView>
          ))}
        </View>
      )}

      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.numbers}>
          <Figure value={String(s.played)} label="Spiele" />
          <Figure value={String(s.wins)} label="Siege" />
          <Figure value={String(s.draws)} label="Unentsch." />
          <Figure value={String(s.losses)} label="Niederl." />
        </View>
        {s.winRate !== null && (
          <ThemedText style={styles.winRate}>Siegquote {pct(s.winRate)}</ThemedText>
        )}
        {eternalPlace >= 0 && (
          <ThemedText style={styles.centerText}>
            Gesamttabelle: Platz {eternalPlace + 1} · {eternal[eternalPlace].points} Punkte
          </ThemedText>
        )}
        <View style={styles.row}>
          <ThemedText type="smallBold" style={styles.flex}>
            Form (letzte Spiele)
          </ThemedText>
          <FormChips form={s.form} />
        </View>
        {streakText && <ThemedText>{streakText}</ThemedText>}
        {presentAll.total > 0 && (
          <ThemedText>
            📅 Dabei {thisYear}: {presentYear.present} von {presentYear.total} Spieltagen
            {presentYear.total ? ` · ${pct(presentYear.rate)}` : ''}
            {presentAll.total !== presentYear.total
              ? ` (insgesamt ${presentAll.present} von ${presentAll.total})`
              : ''}
          </ThemedText>
        )}
        {mvpCount > 0 && (
          <ThemedText>
            ⭐ {mvpCount}× MVP des Tages
          </ThemedText>
        )}
        {s.longestWinStreak >= 2 && (
          <ThemedText type="small" themeColor="textSecondary">
            Längste Siegesserie: {s.longestWinStreak}
          </ThemedText>
        )}
      </ThemedView>

      {badges.length > 0 && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Abzeichen</ThemedText>
          {badges.map((b) => (
            <View key={`${b.kind}-${b.level}`} style={styles.row}>
              <ThemedText style={styles.badgeEmoji}>{badgeEmoji(b)}</ThemedText>
              <View style={styles.flex}>
                <ThemedText style={styles.badgeTitle}>{badgeTitle(b)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {badgeHint(b)}
                </ThemedText>
              </View>
            </View>
          ))}
        </ThemedView>
      )}

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Stärke-Verlauf</ThemedText>
        <StrengthChart points={history} />
        {recentReasons.length > 0 && (
          <View style={styles.reasons}>
            <ThemedText type="smallBold">Warum hat sich der Wert geändert?</ThemedText>
            {recentReasons.map((r) => (
              <ThemedText key={r.seq} type="small" themeColor="textSecondary">
                {formatDate(r.playedOn)}: {r.text}
              </ThemedText>
            ))}
          </View>
        )}
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <PairRow
          emoji="🤝"
          title="Traumduo"
          stat={duo}
          name={name}
          describe={(p) => `${pct(p.winRate)} gemeinsam gewonnen, ${p.played} Spiele`}
        />
        <PairRow
          emoji="😈"
          title="Angstgegner"
          stat={enemy}
          name={name}
          describe={(p) => `nur ${pct(p.winRate)} Siegquote, ${p.played} Spiele`}
        />
        <PairRow
          emoji="😎"
          title="Lieblingsgegner"
          stat={victim}
          name={name}
          describe={(p) => `${pct(p.winRate)} Siegquote, ${p.played} Spiele`}
        />
        <ThemedText type="small" themeColor="textSecondary">
          Zählt erst ab 3 gemeinsamen Spielen.
        </ThemedText>
      </ThemedView>
    </>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.number}>
      <ThemedText style={styles.numberValue}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function PairRow({
  emoji,
  title,
  stat,
  name,
  describe,
}: {
  emoji: string;
  title: string;
  stat: PairStat | null;
  name: (id: string) => string;
  describe: (stat: PairStat) => string;
}) {
  return (
    <View style={styles.pairRow}>
      <ThemedText style={styles.pairEmoji}>{emoji}</ThemedText>
      <View style={styles.flex}>
        <ThemedText type="smallBold">{title}</ThemedText>
        {stat ? (
          <ThemedText>
            {name(stat.otherId)}{' '}
            <ThemedText type="small" themeColor="textSecondary">
              ({describe(stat)})
            </ThemedText>
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            noch keiner
          </ThemedText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  flex: { flex: 1 },
  badgeEmoji: { fontSize: 26, lineHeight: 32 },
  badgeTitle: { fontSize: 16, fontWeight: 700 },
  reasons: { gap: Spacing.one, marginTop: Spacing.two },
  photoRow: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  bigName: { fontSize: 26, lineHeight: 32, fontWeight: 800 },
  strengthBox: { alignItems: 'center' },
  strength: { fontSize: 34, lineHeight: 40, fontWeight: 800 },
  outlined: { borderWidth: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  badge: { borderRadius: 12, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
  badgeText: { fontSize: 16, fontWeight: 800 },
  numbers: { flexDirection: 'row', justifyContent: 'space-between' },
  number: { alignItems: 'center', flex: 1 },
  numberValue: { fontSize: 26, lineHeight: 32, fontWeight: 800 },
  winRate: { fontSize: 18, fontWeight: 700, textAlign: 'center' },
  pairRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  pairEmoji: { fontSize: 26, lineHeight: 32 },
});
