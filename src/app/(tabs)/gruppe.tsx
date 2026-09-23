import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/controls';
import { ErrorText, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { confirmAction } from '@/lib/confirm';
import { useGroup, type Member } from '@/lib/group';
import { APP_URL } from '@/lib/params';
import { shareText } from '@/lib/share';
import { errorMessage } from '@/lib/supabase';

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
  } = useGroup();
  const group = current!;
  const myId = session?.user.id;

  const [members, setMembers] = useState<Member[]>([]);
  const [groupName, setGroupName] = useState(group.name);
  const [myName, setMyName] = useState(profile?.display_name ?? '');
  const [busy, setBusy] = useState(false);
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
    const message = `Komm in unsere Kicker-Gruppe „${group.name}“ beim Hobby-Kicker!\n\n1. App öffnen: ${APP_URL}\n2. Mit deiner E-Mail anmelden\n3. Einladungscode eingeben: ${group.invite_code}`;
    const outcome = await shareText(message);
    if (outcome === 'copied') setShareInfo('Einladung kopiert – jetzt z. B. in WhatsApp einfügen.');
    if (outcome === 'failed') setShareInfo('Bitte den Code oben abschreiben oder markieren und kopieren.');
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

        {/* Mitglieder */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.cardTitle}>Mitglieder ({members.length})</ThemedText>
          {members.map((m) => {
            const isMe = m.user_id === myId;
            return (
              <View key={m.user_id} style={[styles.memberRow, { borderColor: theme.border }]}>
                <View style={styles.flex}>
                  <ThemedText style={styles.memberName}>
                    {m.display_name ?? 'Ohne Namen'}
                    {isMe ? ' (du)' : ''}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {m.role === 'admin' ? 'Admin' : 'Mitglied'}
                  </ThemedText>
                </View>
                {isAdmin && !isMe && (
                  <View style={styles.memberActions}>
                    <SmallButton
                      title={m.role === 'admin' ? 'Admin entziehen' : 'Zum Admin'}
                      disabled={busy}
                      onPress={() => changeRole(m)}
                    />
                    <SmallButton
                      title="Entfernen"
                      danger
                      disabled={busy}
                      onPress={() => kick(m)}
                    />
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
          <BigButton title="Abmelden" variant="secondary" disabled={busy} onPress={signOut} />
          <BigButton
            title="Konto löschen"
            variant="danger"
            disabled={busy}
            onPress={removeAccount}
          />
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

function SmallButton({
  title,
  onPress,
  disabled,
  danger,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallButton,
        {
          borderColor: danger ? theme.danger : theme.border,
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
      ]}>
      <ThemedText type="small" style={{ color: danger ? theme.danger : theme.text, fontWeight: 700 }}>
        {title}
      </ThemedText>
    </Pressable>
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
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexWrap: 'wrap',
  },
  memberName: { fontSize: 17, fontWeight: 700 },
  memberActions: { flexDirection: 'row', gap: Spacing.two },
  smallButton: {
    minHeight: 40,
    paddingHorizontal: Spacing.two,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
