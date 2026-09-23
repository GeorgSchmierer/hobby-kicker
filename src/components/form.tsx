import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Großes Eingabefeld im Stil der App */
export function Field({ style, ...props }: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      style={[
        styles.input,
        { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
        style,
      ]}
      {...props}
    />
  );
}

/** Rote Fehlermeldung (nichts anzeigen, wenn leer) */
export function ErrorText({ message }: { message: string | null | undefined }) {
  const theme = useTheme();
  if (!message) return null;
  return <ThemedText style={[styles.error, { color: theme.danger }]}>{message}</ThemedText>;
}

const styles = StyleSheet.create({
  input: {
    fontSize: 20,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  error: { fontSize: 16, fontWeight: 600 },
});
