import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  adjustStopwatch,
  blowWhistle,
  pauseStopwatch,
  remainingMs,
  resetStopwatch,
  startStopwatch,
  useStopwatch,
} from '@/lib/stopwatch';

const PRESETS = [5, 7, 10, 12, 15, 20];

function format(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function StopwatchScreen() {
  const theme = useTheme();
  const clock = useStopwatch();
  const running = clock.endsAt !== null;
  const left = remainingMs(clock);
  const finished = left === 0 && clock.whistled;
  const progress = clock.durationMs > 0 ? left / clock.durationMs : 0;
  const lastMinute = running && left <= 60_000;

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[
            styles.face,
            {
              borderColor: finished ? theme.danger : lastMinute ? '#F9A825' : theme.primary,
              backgroundColor: theme.backgroundElement,
            },
          ]}>
          <ThemedText style={[styles.time, finished && { color: theme.danger }]}>
            {finished ? 'Abpfiff!' : format(left)}
          </ThemedText>
          <View style={[styles.track, { backgroundColor: theme.border }]}>
            <View
              style={{
                width: `${Math.round(progress * 100)}%`,
                height: '100%',
                backgroundColor: lastMinute ? '#F9A825' : theme.primary,
              }}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Spielzeit {Math.round(clock.durationMs / 60_000)} Min.
          </ThemedText>
        </View>

        {running ? (
          <BigButton title="⏸ Pause" variant="secondary" onPress={pauseStopwatch} style={styles.outlined} />
        ) : (
          <BigButton
            title={clock.remainingMs < clock.durationMs && clock.remainingMs > 0 ? '▶ Weiter' : '▶ Anpfiff'}
            onPress={startStopwatch}
          />
        )}
        <BigButton
          title="↺ Zurücksetzen"
          variant="secondary"
          style={[styles.outlined, { borderColor: theme.border }]}
          onPress={() => resetStopwatch()}
        />

        {!running && (
          <View style={styles.section}>
            <ThemedText type="smallBold">Spielzeit wählen</ThemedText>
            <View style={styles.presets}>
              {PRESETS.map((min) => {
                const selected = clock.durationMs === min * 60_000;
                return (
                  <Pressable
                    key={min}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => resetStopwatch(min * 60_000)}
                    style={[
                      styles.preset,
                      { backgroundColor: selected ? theme.primary : theme.backgroundElement },
                    ]}>
                    <ThemedText
                      style={[styles.presetText, { color: selected ? theme.onPrimary : theme.text }]}>
                      {min}′
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.presets}>
              <BigButton
                title="− 1 Min."
                variant="secondary"
                style={[styles.flex, styles.outlined, { borderColor: theme.border }]}
                onPress={() => adjustStopwatch(-1)}
              />
              <BigButton
                title="+ 1 Min."
                variant="secondary"
                style={[styles.flex, styles.outlined, { borderColor: theme.border }]}
                onPress={() => adjustStopwatch(1)}
              />
            </View>
          </View>
        )}

        <BigButton
          title="🔊 Pfiff testen"
          variant="secondary"
          style={[styles.outlined, { borderColor: theme.border }]}
          onPress={blowWhistle}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Der Bildschirm bleibt an, solange die Uhr läuft. Lass die Stoppuhr geöffnet – im
          Hintergrund kann das Handy den Pfiff nicht abspielen.
        </ThemedText>
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
  center: { textAlign: 'center' },
  section: { gap: Spacing.two },
  face: {
    borderRadius: 24,
    borderWidth: 4,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
  },
  time: {
    fontSize: 88,
    lineHeight: 100,
    fontWeight: 800,
    fontVariant: ['tabular-nums'],
  },
  track: { width: '100%', height: 10, borderRadius: 5, overflow: 'hidden' },
  outlined: { borderWidth: 1 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  preset: {
    flexGrow: 1,
    minWidth: 64,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetText: { fontSize: 20, fontWeight: 700 },
});
