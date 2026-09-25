/**
 * Jahresrückblick als Bild (TODO C4, nur Web): zeichnet eine Karte (1080 × 1350, passt für
 * WhatsApp/Instagram) und teilt sie – oder lädt sie herunter, wenn der Browser nicht teilen kann.
 */
import { Platform } from 'react-native';

import { saveFile } from './save-file';

const WIDTH = 1080;
const HEIGHT = 1350;

export function canShareImage(): boolean {
  return Platform.OS === 'web' && typeof document !== 'undefined';
}

/** lines: [Emoji, Text] je Zeile */
export async function shareReviewImage(
  title: string,
  subtitle: string,
  lines: [string, string][],
  fileName: string
): Promise<'shared' | 'downloaded' | 'failed'> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d')!;

    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, '#1B8A3C');
    gradient.addColorStop(1, '#0B4A1F');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Mittellinie und Anstoßkreis wie auf dem Spielfeld
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT - 180, 150, 0, Math.PI * 2);
    ctx.moveTo(0, HEIGHT - 180);
    ctx.lineTo(WIDTH, HEIGHT - 180);
    ctx.stroke();

    const font = (size: number, weight = 700) =>
      `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = font(76, 800);
    ctx.fillText(title, WIDTH / 2, 150);
    ctx.font = font(40, 500);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(subtitle, WIDTH / 2, 215);

    ctx.textAlign = 'left';
    let y = 330;
    for (const [emoji, text] of lines) {
      ctx.font = font(60, 400);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(emoji, 90, y);
      ctx.font = font(42, 600);
      wrap(ctx, text, WIDTH - 280).forEach((line, i) => ctx.fillText(line, 190, y - 6 + i * 52));
      y += 150;
    }

    ctx.textAlign = 'center';
    ctx.font = font(34, 600);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('⚽ Hobby-Kicker', WIDTH / 2, HEIGHT - 60);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return 'failed';
    return await saveFile(blob, fileName);
  } catch {
    return 'failed';
  }
}

/** Zeilenumbruch für längere Texte */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}
