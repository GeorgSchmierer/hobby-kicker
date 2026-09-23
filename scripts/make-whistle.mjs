/**
 * Erzeugt den Abpfiff (kurz – kurz – lang) als WAV-Datei: Trillerpfeife = hoher Ton,
 * schnell „flatternd“ (die Kugel in der Pfeife), plus etwas Rauschen.
 * Aufruf: node scripts/make-whistle.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RATE = 22050;
const pulses = [
  { start: 0.0, length: 0.22 },
  { start: 0.34, length: 0.22 },
  { start: 0.68, length: 0.9 },
];
const total = 1.75;
const samples = new Float32Array(Math.ceil(total * RATE));

let phase = 0;
for (let i = 0; i < samples.length; i++) {
  const t = i / RATE;
  const pulse = pulses.find((p) => t >= p.start && t < p.start + p.length);
  if (!pulse) continue;
  const local = t - pulse.start;
  // weicher Ein- und Ausklang
  const env = Math.min(1, local / 0.02) * Math.min(1, (pulse.length - local) / 0.06);
  // Triller: Frequenz schwankt ~30 mal pro Sekunde
  const trill = Math.sin(2 * Math.PI * 30 * local);
  const freq = 2850 + 180 * trill;
  phase += (2 * Math.PI * freq) / RATE;
  const tone = Math.sin(phase) + 0.25 * Math.sin(2 * phase);
  const amp = 0.75 + 0.25 * trill; // Lautstärke flattert mit
  const noise = (Math.random() * 2 - 1) * 0.08;
  samples[i] = env * (0.45 * amp * tone + noise);
}

// 16-Bit-PCM-WAV schreiben
const data = Buffer.alloc(samples.length * 2);
samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

const out = join(import.meta.dirname, '..', 'assets', 'sounds', 'whistle.wav');
mkdirSync(join(out, '..'), { recursive: true });
writeFileSync(out, Buffer.concat([header, data]));
console.log('✓ assets/sounds/whistle.wav', `${(44 + data.length) / 1024 | 0} KB`);
