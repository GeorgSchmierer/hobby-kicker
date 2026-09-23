import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, TeamColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const teamColor = (idx: number) => TeamColors[idx % TeamColors.length];
export const teamName = (idx: number) => `Team ${teamColor(idx).name}`;

/** Farbiger Punkt vor einem Teamnamen */
export function TeamDot({ idx, size = 14 }: { idx: number; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: teamColor(idx).color,
      }}
    />
  );
}

/** Großer Auswahl-Knopf für ein Team (z. B. „Wer hat gewonnen?“) */
export function TeamChip({
  idx,
  label,
  selected,
  disabled,
  onPress,
}: {
  idx: number;
  label?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = teamColor(idx).color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? color : theme.border,
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        },
      ]}>
      <TeamDot idx={idx} />
      <ThemedText style={styles.chipText}>{label ?? teamColor(idx).name}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  chipText: { fontSize: 17, fontWeight: 700 },
});
