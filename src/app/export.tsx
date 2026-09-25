import { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet } from 'react-native';

import { BigButton } from '@/components/controls';
import { ErrorText } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildSheets, loadExportData, toPdf, toXlsx } from '@/lib/export';
import { useGroup } from '@/lib/group';
import { saveFile } from '@/lib/save-file';
import { berlinToday } from '@/lib/schedule';
import { errorMessage } from '@/lib/supabase';

type Format = 'xlsx' | 'pdf';

/** Daten-Export (TODO D3): Admin wählt das Format, dann entsteht die Datei */
export default function ExportScreen() {
  const theme = useTheme();
  const { current, isAdmin } = useGroup();
  const [busy, setBusy] = useState<Format | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin || !current) {
    return (
      <ThemedView style={styles.screen}>
        <ThemedText style={styles.missing}>Exportieren können nur Admins.</ThemedText>
      </ThemedView>
    );
  }
  if (Platform.OS !== 'web') {
    return (
      <ThemedView style={styles.screen}>
        <ThemedText style={styles.missing}>Der Export ist in der Web-App verfügbar.</ThemedText>
      </ThemedView>
    );
  }

  const run = async (format: Format) => {
    setBusy(format);
    setInfo(null);
    setError(null);
    try {
      const today = berlinToday();
      const sheets = buildSheets(await loadExportData(current.id, current.name));
      const base = `hobby-kicker-${current.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-${today}`;
      const blob =
        format === 'xlsx'
          ? new Blob([toXlsx(sheets) as BlobPart], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            })
          : await toPdf(sheets, current.name, today.split('-').reverse().join('.'));
      const outcome = await saveFile(blob, `${base}.${format}`);
      if (outcome === 'failed') setError('Die Datei konnte nicht gespeichert werden.');
      else setInfo(outcome === 'downloaded' ? 'Datei gespeichert (Ordner „Downloads“).' : 'Fertig ✓');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText themeColor="textSecondary">
          Alle Daten der Gruppe „{current.name}“ als Datei: Spieler mit Werten, Spieltage, Teams,
          Ergebnisse und Wertungsverlauf (je ein Tabellenblatt). Keine E-Mail-Adressen. Gut als
          Sicherung oder für eine Datenschutz-Auskunft.
        </ThemedText>
        <ThemedText type="smallBold">In welchem Format?</ThemedText>
        <BigButton
          title={busy === 'xlsx' ? 'Wird erstellt …' : '📊 Excel (XLSX)'}
          disabled={!!busy}
          onPress={() => run('xlsx')}
        />
        <ThemedText type="small" themeColor="textSecondary">
          Zum Weiterrechnen – öffnet sich in Excel, Numbers oder Google Tabellen.
        </ThemedText>
        <BigButton
          title={busy === 'pdf' ? 'Wird erstellt …' : '📄 PDF'}
          variant="secondary"
          style={[styles.outlined, { borderColor: theme.border }]}
          disabled={!!busy}
          onPress={() => run('pdf')}
        />
        <ThemedText type="small" themeColor="textSecondary">
          Zum Anschauen und Ausdrucken.
        </ThemedText>
        {busy && <ActivityIndicator color={theme.primary} />}
        {info && <ThemedText style={{ color: theme.primary, fontWeight: 700 }}>{info}</ThemedText>}
        <ErrorText message={error} />
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
  missing: { padding: Spacing.four, textAlign: 'center' },
  outlined: { borderWidth: 1 },
});
