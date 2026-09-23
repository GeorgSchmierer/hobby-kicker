import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const PIECES = 70;

/** Konfetti-Regen über den ganzen Bildschirm (blockiert keine Berührungen) */
export function Confetti({ colors }: { colors: readonly string[] }) {
  const { width, height } = useWindowDimensions();
  // Zufallswerte nur einmal beim Erscheinen festlegen
  const [pieces] = useState(() =>
      Array.from({ length: PIECES }, (_, i) => ({
        id: i,
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 160,
        delay: Math.random() * 600,
        duration: 2200 + Math.random() * 1600,
        size: 7 + Math.random() * 7,
        spin: (Math.random() - 0.5) * 1440,
        color: colors[i % colors.length],
        round: Math.random() < 0.3,
      }))
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map(({ id, ...p }) => (
        <Piece key={id} {...p} fall={height + 40} />
      ))}
    </View>
  );
}

function Piece(props: {
  x: number;
  drift: number;
  delay: number;
  duration: number;
  size: number;
  spin: number;
  color: string;
  round: boolean;
  fall: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      props.delay,
      withTiming(1, { duration: props.duration, easing: Easing.in(Easing.quad) })
    );
  }, [progress, props.delay, props.duration]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.85 ? 1 : (1 - progress.value) / 0.15,
    transform: [
      { translateX: props.x + props.drift * progress.value },
      { translateY: -30 + props.fall * progress.value },
      { rotate: `${props.spin * progress.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          width: props.size,
          height: props.round ? props.size : props.size * 0.45,
          borderRadius: props.round ? props.size / 2 : 2,
          backgroundColor: props.color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', top: 0, left: 0 },
});
