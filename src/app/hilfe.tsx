import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  currentDevice,
  currentlyInAppBrowser,
  isInstalled,
  promptInstall,
  useCanPromptInstall,
  type DeviceKind,
} from '@/lib/install';
import { APP_URL } from '@/lib/params';

const APP_HOST = APP_URL.replace(/^https?:\/\//, '');

/** Anleitung: App auf den Home-Bildschirm legen – für iPhone und Android */
export default function HelpScreen() {
  const theme = useTheme();
  const detected = currentDevice();
  const [device, setDevice] = useState<Exclude<DeviceKind, 'desktop'>>(
    detected === 'android' ? 'android' : 'ios'
  );
  const installed = isInstalled();
  const inAppBrowser = currentlyInAppBrowser();

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {installed ? (
          <Notice color={theme.primary}>
            ✅ Du nutzt die App bereits vom Home-Bildschirm – alles richtig gemacht!
          </Notice>
        ) : (
          <ThemedText style={styles.intro}>
            Leg dir die App einmal auf den Home-Bildschirm. Dann hast du ein eigenes Symbol ⚽ und
            musst dir keinen Link merken. Das dauert eine Minute und kostet nichts.
          </ThemedText>
        )}

        {inAppBrowser && (
          <Notice color="#F9A825">
            ⚠️ Du hast den Link in einer App wie WhatsApp geöffnet. Dort klappt das Installieren
            nicht. Tippe oben rechts auf <B>⋯</B> bzw. <B>⋮</B> und wähle{' '}
            <B>„In Safari öffnen“</B> (iPhone) oder <B>„Im Browser öffnen“</B> (Android).
          </Notice>
        )}

        {detected === 'desktop' && !installed && (
          <Notice color={theme.primary}>
            💻 Am PC kannst du die App einfach im Browser nutzen. Fürs Handy: Öffne dort{' '}
            <B>{APP_HOST}</B> und folge der Anleitung unten.
          </Notice>
        )}

        {/* Gerät wählen */}
        <View style={styles.segment}>
          {(
            [
              ['ios', '🍎 iPhone'],
              ['android', '🤖 Android'],
            ] as const
          ).map(([value, label]) => {
            const selected = device === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setDevice(value)}
                style={[
                  styles.segmentButton,
                  { backgroundColor: selected ? theme.primary : theme.backgroundElement },
                ]}>
                <ThemedText
                  style={[styles.segmentText, { color: selected ? theme.onPrimary : theme.text }]}>
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {device === 'ios' ? <IosSteps /> : <AndroidSteps />}

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.cardTitle}>🎉 Geschafft – und dann?</ThemedText>
          <ThemedText>
            Auf dem Home-Bildschirm erscheint das <B>grüne Symbol mit dem Fußball</B> und dem Namen{' '}
            <B>„Kicker“</B>. Ab jetzt öffnest du die App immer darüber – im Vollbild, ohne
            Browserleiste. Das Browserfenster kannst du schließen.
          </ThemedText>
        </ThemedView>

        <ThemedText type="smallBold" style={styles.faqTitle}>
          Häufige Fragen
        </ThemedText>
        <Faq question="Muss ich mich nochmal anmelden?">
          Ja, einmal. Die App vom Home-Bildschirm speichert getrennt vom Browser. Gib deine E-Mail
          ein und tipp den Code aus der Mail ein – danach bleibst du angemeldet.
        </Faq>
        <Faq question="Wie bekomme ich neue Versionen?">
          Automatisch. Wenn es etwas Neues gibt, schließ die App einmal ganz und öffne sie wieder.
        </Faq>
        <Faq question="Kostet das etwas?">Nein. Die App ist kostenlos und ohne Werbung.</Faq>
        <Faq question="Ist das sicher?">
          Ja. Die App läuft abgeschottet wie eine Webseite und hat keinen Zugriff auf Kontakte,
          Fotos, Standort oder Kamera. Gespeichert werden nur deine E-Mail (für die Anmeldung), dein
          Spitzname und die Fußballdaten deiner Gruppe. Nutze nur die Adresse <B>{APP_HOST}</B>.
        </Faq>
        <Faq question="Wie entferne ich die App wieder?">
          Wie jede App: Symbol lange drücken und „App entfernen“ bzw. „Deinstallieren“ wählen.
        </Faq>
      </ScrollView>
    </ThemedView>
  );
}

function IosSteps() {
  return (
    <View style={styles.steps}>
      <Step n={1}>
        Öffne <B>{APP_HOST}</B> in <B>Safari</B> (dem Browser mit dem blauen Kompass).
      </Step>
      <Step n={2} extra={<ShareIcon />}>
        Tippe unten in der Leiste auf das <B>Teilen-Symbol</B> – das Quadrat mit dem Pfeil nach
        oben. (Beim iPad ist es oben rechts.)
      </Step>
      <Step n={3}>
        Scrolle im Menü nach unten und tippe auf <B>„Zum Home-Bildschirm“</B> ➕. Siehst du es nicht,
        tippe erst auf <B>„Mehr“</B> bzw. <B>„Aktionen bearbeiten“</B>.
      </Step>
      <Step n={4}>
        Tippe oben rechts auf <B>„Hinzufügen“</B>.
      </Step>
    </View>
  );
}

function AndroidSteps() {
  const canPrompt = useCanPromptInstall();
  const [done, setDone] = useState(false);
  return (
    <View style={styles.steps}>
      {canPrompt && !done && (
        <BigButton
          title="📲 Jetzt installieren"
          onPress={async () => setDone(await promptInstall())}
        />
      )}
      {done && <Notice color="#2E7D32">✅ Installiert! Schau auf deinen Startbildschirm.</Notice>}
      {canPrompt && !done && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Klappt der Knopf nicht? Dann so:
        </ThemedText>
      )}
      <Step n={1}>
        Öffne <B>{APP_HOST}</B> in <B>Chrome</B>.
      </Step>
      <Step n={2} extra={<ThemedText style={styles.menuIcon}>⋮</ThemedText>}>
        Tippe oben rechts auf die <B>drei Punkte</B>.
      </Step>
      <Step n={3}>
        Tippe auf <B>„App installieren“</B>. Steht das nicht da, nimm{' '}
        <B>„Zum Startbildschirm hinzufügen“</B>.
      </Step>
      <Step n={4}>
        Bestätige mit <B>„Installieren“</B>.
      </Step>
    </View>
  );
}

function Step({ n, children, extra }: { n: number; children: ReactNode; extra?: ReactNode }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.step}>
      <View style={[styles.stepNumber, { backgroundColor: theme.primary }]}>
        <ThemedText style={[styles.stepNumberText, { color: theme.onPrimary }]}>{n}</ThemedText>
      </View>
      <ThemedText style={styles.stepText}>{children}</ThemedText>
      {extra}
    </ThemedView>
  );
}

/** Nachgezeichnetes iOS-Teilen-Symbol (Quadrat mit Pfeil nach oben) */
function ShareIcon() {
  const color = '#0A84FF';
  return (
    <View style={styles.shareIcon} accessibilityLabel="Teilen-Symbol">
      <View style={[styles.shareBox, { borderColor: color }]} />
      <View style={[styles.shareStem, { backgroundColor: color }]} />
      <ThemedText style={[styles.shareArrow, { color }]}>⌃</ThemedText>
    </View>
  );
}

function Faq({ question, children }: { question: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <ThemedView type="backgroundElement" style={styles.faq}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.faqHead}>
        <ThemedText style={[styles.faqQuestion, styles.flex]}>{question}</ThemedText>
        <ThemedText themeColor="textSecondary">{open ? '▲' : '▼'}</ThemedText>
      </Pressable>
      {open && <ThemedText themeColor="textSecondary">{children}</ThemedText>}
    </ThemedView>
  );
}

function Notice({ color, children }: { color: string; children: ReactNode }) {
  return (
    <ThemedView type="backgroundElement" style={[styles.notice, { borderColor: color }]}>
      <ThemedText>{children}</ThemedText>
    </ThemedView>
  );
}

const B = ({ children }: { children: ReactNode }) => (
  <ThemedText style={styles.bold}>{children}</ThemedText>
);

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
  center: { textAlign: 'center' },
  bold: { fontWeight: 800 },
  intro: { fontSize: 17, lineHeight: 25 },
  notice: { borderRadius: 14, borderWidth: 2, padding: Spacing.three },
  segment: { flexDirection: 'row', gap: Spacing.two },
  segmentButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontSize: 17, fontWeight: 700 },
  steps: { gap: Spacing.two },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    padding: Spacing.three,
  },
  stepNumber: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 18, fontWeight: 800 },
  stepText: { flex: 1, fontSize: 17, lineHeight: 24 },
  menuIcon: { fontSize: 30, lineHeight: 34, fontWeight: 800, width: 28, textAlign: 'center' },
  shareIcon: { width: 30, height: 36, alignItems: 'center' },
  shareBox: {
    position: 'absolute',
    bottom: 0,
    width: 24,
    height: 22,
    borderWidth: 2.5,
    borderTopWidth: 0,
    borderRadius: 4,
  },
  shareStem: { position: 'absolute', top: 6, width: 2.5, height: 20, borderRadius: 1 },
  shareArrow: { position: 'absolute', top: -6, fontSize: 22, lineHeight: 24, fontWeight: 800 },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  cardTitle: { fontSize: 18, fontWeight: 800 },
  faqTitle: { marginTop: Spacing.two },
  faq: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  faqQuestion: { fontSize: 16, fontWeight: 700 },
});
