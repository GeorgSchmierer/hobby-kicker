import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BigButton, Chip, SmallButton } from '@/components/controls';
import { ErrorText, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { confirmAction } from '@/lib/confirm';
import { useNextEvent } from '@/lib/events';
import { useGroup, type Member } from '@/lib/group';
import { APP_URL } from '@/lib/params';
import { formatTime, WEEKDAYS } from '@/lib/schedule';
import { shareText } from '@/lib/share';
import { errorMessage } from '@/lib/supabase';
import { applyUpdate, fetchLatestVersion, isNewer, shortVersion } from '@/lib/updates';

export default function GroupScreen() {
  const theme = useTheme();
  const { session, profile, setDisplayName, signOut, deleteAccount } = useAuth();
  const {
    current,
    isAdmin,
    loadMembers,
    renameGroup,
    regenerateInviteCode,
    leaveGroup,
    setMemberRole,
    removeMember,
    setMemberName,
    linkPlayer,
    players,
  } = useGroup();
  const group = current!;
  const myId = session?.user.id;

  const [members, setMembers] = useState<Member[]>([]);
  const schedule = useNextEvent(group.id).data?.info?.schedule;
  const [groupName, setGroupName] = useState(group.name);
  const [myName, setMyName] = useState(profile?.display_name ?? '');
  const [busy, setBusy] = useState(false);
  // Mitglied, das der Admin gerade bearbeitet
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const playerOf = (userId: string) => players.find((p) => p.user_id === userId);
  const myPlayer = myId ? playerOf(myId) : undefined;
  const [error, setError] = useState<string | null>(null);

  const reloadMembers = useCallback(() => {
    loadMembers()
      .then(setMembers)
      .catch((e) => setError(errorMessage(e)));
  }, [loadMembers]);

  useFocusEffect(
    useCallback(() => {
      setGroupName(group.name);
      reloadMembers();
    }, [group.name, reloadMembers])
  );

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const [shareInfo, setShareInfo] = useState<string | null>(null);
  const shareCode = async () => {
    const message = `Komm in unsere Kicker-Gruppe „${group.name}“ beim Hobby-Kicker!\n\n1. Link öffnen: ${APP_URL}\n2. Am besten zuerst aufs Handy holen – die Anleitung steht direkt auf der Startseite („App auf den Home-Bildschirm legen“)\n3. Mit deiner E-Mail anmelden\n4. Einladungscode eingeben: ${group.invite_code}`;
    const outcome = await shareText(message);
    if (outcome === 'copied') setShareInfo('Einladung kopiert – jetzt z. B. in WhatsApp einfügen.');
    if (outcome === 'failed') setShareInfo('Bitte den Code oben abschreiben oder markieren und kopieren.');
  };

  const [updateInfo, setUpdateInfo] = useState<string | null>(null);
  const checkForUpdate = async () => {
    setUpdateInfo('wird geprüft …');
    const latest = await fetchLatestVersion();
    if (isNewer(latest)) applyUpdate();
    else setUpdateInfo(latest ? 'aktuell ✅' : 'keine Verbindung');
  };

  const newCode = async () => {
    const ok = await confirmAction(
      'Neuen Einladungscode erzeugen?',
      'Der bisherige Code funktioniert danach nicht mehr. Wer schon in der Gruppe ist, bleibt drin.',
      'Neuer Code'
    );
    if (ok) run(regenerateInviteCode);
  };

  const changeRole = (m: Member) =>
    run(async () => {
      await setMemberRole(m.user_id, m.role === 'admin' ? 'member' : 'admin');
      reloadMembers();
    });

  const startEdit = (m: Member) => {
    setEditing(editing === m.user_id ? null : m.user_id);
    setEditName(m.display_name ?? '');
  };

  const saveName = (m: Member) =>
    run(async () => {
      await setMemberName(m.user_id, editName);
      reloadMembers();
    });

  const choosePlayer = (m: Member, playerId: string | null) => run(() => linkPlayer(m.user_id, playerId));

  const kick = async (m: Member) => {
    const ok = await confirmAction(
      `${m.display_name ?? 'Mitglied'} entfernen?`,
      'Die Person kann mit dem Einladungscode wieder beitreten. Erneuere den Code, falls sie das nicht soll.',
      'Entfernen'
    );
    if (ok)
      run(async () => {
        await removeMember(m.user_id);
        reloadMembers();
      });
  };

  const leave = async () => {
    const alone = members.length <= 1;
    const ok = await confirmAction(
      `„${group.name}“ verlassen?`,
      alone
        ? 'Du bist das letzte Mitglied. Die Gruppe wird mit allen Spielern gelöscht.'
        : 'Du kannst später mit dem Einladungscode wieder beitreten.',
      alone ? 'Gruppe löschen' : 'Verlassen'
    );
    if (ok) run(leaveGroup);
  };

  const removeAccount = async () => {
    const ok = await confirmAction(
      'Konto endgültig löschen?',
      'Dein Konto und deine Mitgliedschaften werden gelöscht. Gruppen, in denen du der letzte bist, werden mit allen Spielern gelöscht. Das kann nicht rückgängig gemacht werden.',
      'Konto löschen'
    );
    if (ok) run(deleteAccount);
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ErrorText message={error} />

        {/* Einladungscode */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.cardTitle}>Einladungscode</ThemedText>
          <ThemedText selectable style={styles.code}>
            {group.invite_code}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Mit diesem Code können Freunde der Gruppe beitreten.
          </ThemedText>
          <BigButton title="Code teilen" onPress={shareCode} />
          {shareInfo && <ThemedText type="small">{shareInfo}</ThemedText>}
          {isAdmin && (
            <BigButton
              title="Neuen Code erzeugen"
              variant="secondary"
              style={[styles.outlined, { borderColor: theme.border }]}
              disabled={busy}
              onPress={newCode}
            />
          )}
        </ThemedView>

        {/* Fester Termin */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.cardTitle}>Fester Termin</ThemedText>
          <ThemedText themeColor={schedule ? 'text' : 'textSecondary'}>
            {schedule
              ? `Jeden ${WEEKDAYS[schedule.weekday - 1]}, ${formatTime(schedule.start_time)} Uhr${schedule.location ? ` · ${schedule.location}` : ''}${schedule.max_players ? ` · max. ${schedule.max_players} Spieler` : ''}`
              : 'Noch kein fester Termin.'}
          </ThemedText>
          {isAdmin && (
            <BigButton
              title={schedule ? 'Termin ändern / absagen' : 'Termin festlegen'}
              variant="secondary"
              style={[styles.outlined, { borderColor: theme.border }]}
              onPress={() => router.push('/termin')}
            />
          )}
        </ThemedView>

        {/* Mitglieder */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.cardTitle}>Mitglieder ({members.length})</ThemedText>
          {members.map((m) => {
            const isMe = m.user_id === myId;
            const linked = playerOf(m.user_id);
            const canEdit = isAdmin && !isMe;
            const open = editing === m.user_id;
            return (
              <View key={m.user_id} style={[styles.memberBlock, { borderColor: theme.border }]}>
                <View style={styles.memberRow}>
                  <View style={styles.flex}>
                    <ThemedText style={styles.memberName}>
                      {m.display_name ?? 'Ohne Namen'}
                      {isMe ? ' (du)' : ''}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {m.role === 'admin' ? 'Admin' : 'Mitglied'}
                      {' · '}
                      {linked ? `Spieler: ${linked.name}` : 'kein Spieler zugeordnet'}
                    </ThemedText>
                  </View>
                  {isAdmin && (
                    <SmallButton
                      title={open ? 'Fertig' : 'Bearbeiten'}
                      disabled={busy}
                      onPress={() => startEdit(m)}
                    />
                  )}
                </View>

                {open && (
                  <View style={styles.editBox}>
                    {canEdit && (
                      <>
                        <ThemedText type="smallBold">Name</ThemedText>
                        <View style={styles.memberRow}>
                          <Field
                            value={editName}
                            onChangeText={setEditName}
                            maxLength={30}
                            style={styles.flex}
                          />
                          <SmallButton
                            title="Speichern"
                            disabled={busy || !editName.trim() || editName.trim() === m.display_name}
                            onPress={() => saveName(m)}
                          />
                        </View>
                      </>
                    )}

                    <ThemedText type="smallBold">Spieler</ThemedText>
                    <View style={styles.chips}>
                      {players
                        .filter((p) => p.active || p.id === linked?.id)
                        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                        .map((p) => {
                          const selected = p.id === linked?.id;
                          const taken = !!p.user_id && !selected;
                          return (
                            <Chip
                              key={p.id}
                              title={taken ? `${p.name} (vergeben)` : p.name}
                              selected={selected}
                              disabled={busy || taken}
                              onPress={() => choosePlayer(m, selected ? null : p.id)}
                            />
                          );
                        })}
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {linked
                        ? 'Nochmal auf den Spieler tippen hebt die Zuordnung auf.'
                        : 'Welcher Spieler ist diese Person? Einfach antippen.'}
                    </ThemedText>

                    {canEdit && (
                      <View style={styles.memberActions}>
                        <SmallButton
                          title={m.role === 'admin' ? 'Admin entziehen' : 'Zum Admin'}
                          disabled={busy}
                          onPress={() => changeRole(m)}
                        />
                        <SmallButton title="Entfernen" danger disabled={busy} onPress={() => kick(m)} />
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ThemedView>

        {/* Gruppe umbenennen (nur Admin) */}
        {isAdmin && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText style={styles.cardTitle}>Name der Gruppe</ThemedText>
            <Field value={groupName} onChangeText={setGroupName} maxLength={40} />
            <BigButton
              title="Namen speichern"
              variant="secondary"
              style={[styles.outlined, { borderColor: theme.border }]}
              disabled={busy || !groupName.trim() || groupName.trim() === group.name}
              onPress={() => run(() => renameGroup(groupName))}
            />
          </ThemedView>
        )}

        <BigButton
          title="💶 Kasse – wer schuldet was?"
          variant="secondary"
          style={[styles.outlined, { borderColor: theme.border }]}
          onPress={() => router.push('/kasse')}
        />
        <BigButton
          title="📲 App installieren – Anleitung"
          variant="secondary"
          style={[styles.outlined, { borderColor: theme.border }]}
          onPress={() => router.push('/hilfe')}
        />
        <BigButton
          title="Gruppe wechseln / neue Gruppe"
          variant="secondary"
          style={[styles.outlined, { borderColor: theme.border }]}
          onPress={() => router.push('/gruppen')}
        />
        <BigButton title="Gruppe verlassen" variant="danger" disabled={busy} onPress={leave} />

        {/* Mein Konto */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.cardTitle}>Mein Konto</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Angemeldet als {session?.user.email}
          </ThemedText>
          <ThemedText type="smallBold">Mein Name in der Gruppe</ThemedText>
          <Field value={myName} onChangeText={setMyName} maxLength={30} />
          <BigButton
            title="Namen speichern"
            variant="secondary"
            style={[styles.outlined, { borderColor: theme.border }]}
            disabled={busy || !myName.trim() || myName.trim() === profile?.display_name}
            onPress={() =>
              run(async () => {
                await setDisplayName(myName);
                reloadMembers();
              })
            }
          />
          {myPlayer && (
            <BigButton
              title={`👤 Mein Spielerprofil (${myPlayer.name})`}
              variant="secondary"
              style={[styles.outlined, { borderColor: theme.border }]}
              onPress={() => router.push({ pathname: '/profil/[id]', params: { id: myPlayer.id } })}
            />
          )}
          <BigButton title="Abmelden" variant="secondary" disabled={busy} onPress={signOut} />
          <BigButton
            title="Konto löschen"
            variant="danger"
            disabled={busy}
            onPress={removeAccount}
          />
        </ThemedView>

        {/* Version und Updates */}
        <View style={styles.versionRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            Version {shortVersion()}
            {updateInfo ? ` · ${updateInfo}` : ''}
          </ThemedText>
          <SmallButton title="🔄 Nach Updates suchen" onPress={checkForUpdate} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  flex: { flex: 1 },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  cardTitle: { fontSize: 18, fontWeight: 700 },
  code: { fontSize: 34, lineHeight: 44, fontWeight: 700, letterSpacing: 4, textAlign: 'center' },
  outlined: { borderWidth: 1 },
  memberBlock: {
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  editBox: { gap: Spacing.two, paddingLeft: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  memberName: { fontSize: 17, fontWeight: 700 },
  memberActions: { flexDirection: 'row', gap: Spacing.two },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
