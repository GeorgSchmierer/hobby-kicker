import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useGroup } from '@/lib/group';

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
  };

export default function TabLayout() {
  const theme = useTheme();
  const { current } = useGroup();
  const groupName = current?.name ?? '';
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarLabelStyle: { fontSize: 13, fontWeight: 600 },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Spieltag', headerTitle: `Spieltag · ${groupName}`, tabBarIcon: icon('⚽') }}
      />
      <Tabs.Screen
        name="spieler"
        options={{ title: 'Spieler', headerTitle: `Spieler · ${groupName}`, tabBarIcon: icon('👥') }}
      />
      <Tabs.Screen
        name="gruppe"
        options={{ title: 'Gruppe', headerTitle: groupName, tabBarIcon: icon('⚙️') }}
      />
    </Tabs>
  );
}
