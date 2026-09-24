/**
 * Baut die Web-App (wird von Vercel aufgerufen, siehe vercel.json) und gibt ihr eine
 * Versionskennung: den Git-Commit. Die Kennung landet in der App (EXPO_PUBLIC_APP_VERSION)
 * und in dist/version.json – so erkennt die App, wenn online eine neuere Version liegt.
 * Aufruf: node scripts/build-web.mjs
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
let version = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
if (!version) {
  try {
    version = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
  } catch {
    version = '';
  }
}

execSync('npx expo export --platform web', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, EXPO_PUBLIC_APP_VERSION: version },
});

writeFileSync(join(root, 'dist', 'version.json'), JSON.stringify({ version }));
console.log(`✓ Version ${version.slice(0, 7) || '(ohne Kennung)'} gebaut`);
