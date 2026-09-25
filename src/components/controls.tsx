import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { RATING_LIMITS } from '@/lib/params';
import { formatRating, stepRating } from '@/lib/ratings';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: StyleProp<ViewStyle>;
};

/** Großer Button – gut am Spielfeldrand zu treffen */
export function BigButton({ title, variant = 'primary', disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const background =
    variant === 'primary'
      ? theme.primary
      : variant === 'danger'
        ? theme.danger
        : theme.backgroundElement;
  const color = variant === 'secondary' ? theme.text : theme.onPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        style,
      ]}
      {...rest}>
      <ThemedText style={[styles.buttonText, { color }]}>{title}</ThemedText>
    </Pressable>
  );
}

type StepperProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

/** Plus/Minus-Regler für Stärkewerte (1–11) */
export function RatingStepper({ label, value, onChange }: StepperProps) {
  const theme = useTheme();

  return (
    <View style={styles.stepperRow}>
      <ThemedText type="subtitle" style={styles.stepperLabel}>
        {label}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} verringern`}
        disabled={value <= RATING_LIMITS.min}
        onPress={() => onChange(stepRating(value, -1))}
        style={({ pressed }) => [
          styles.stepButton,
          { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.6 : 1 },
        ]}>
        <ThemedText style={styles.stepSymbol}>−</ThemedText>
      </Pressable>
      <ThemedText style={styles.stepValue}>{formatRating(value)}</ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} erhöhen`}
        disabled={value >= RATING_LIMITS.max}
        onPress={() => onChange(stepRating(value, 1))}
        style={({ pressed }) => [
          styles.stepButton,
          { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.6 : 1 },
        ]}>
        <ThemedText style={styles.stepSymbol}>+</ThemedText>
      </Pressable>
    </View>
  );
}

/** Kleiner Rahmen-Knopf für Nebenaktionen */
export function SmallButton({
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

/** Auswahl-Knopf (rund), ausgewählt = grün mit Haken */
export function Chip({
  title,
  selected,
  disabled,
  onPress,
}: {
  title: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? theme.primary : 'transparent',
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
      ]}>
      <ThemedText type="small" style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: 700 }}>
        {selected ? '✓ ' : ''}
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  smallButton: {
    minHeight: 40,
    paddingHorizontal: Spacing.two,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
  },
  button: {
    minHeight: 56,
    borderRadius: 14,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 700,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepperLabel: {
    flex: 1,
    fontSize: 20,
    lineHeight: 28,
  },
  stepButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSymbol: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: 700,
  },
  stepValue: {
    width: 56,
    textAlign: 'center',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: 700,
  },
});
