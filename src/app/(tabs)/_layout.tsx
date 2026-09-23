import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
  };

export default function TabLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarLabelStyle: { fontSize: 13, fontWeight: 600 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Spieltag', tabBarIcon: icon('⚽') }} />
      <Tabs.Screen name="spieler" options={{ title: 'Spieler', tabBarIcon: icon('👥') }} />
    </Tabs>
  );
}
