/**
 * Baut die Web-App (wird von Vercel aufgerufen, siehe vercel.json) und gibt ihr eine
 * Versionskennung: den Git-Commit. Die Kennung landet in der App (EXPO_PUBLIC_APP_VERSION)
 * und in dist/version.json – so erkennt die App, wenn online eine neuere Version liegt.
 * Außerdem entsteht dist/sw.js (Service Worker für den Offline-Modus) aus scripts/sw-template.js.
 * Aufruf: node scripts/build-web.mjs
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist');
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

writeFileSync(join(dist, 'version.json'), JSON.stringify({ version }));

// Service Worker: alle Dateien der App vorab auf dem Handy speichern
function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}
const skip = new Set(['/sw.js', '/version.json', '/metadata.json']);
const files = [
  '/',
  ...listFiles(dist)
    .map((f) => '/' + relative(dist, f).split('\\').join('/'))
    .filter((f) => !skip.has(f)),
];
const template = readFileSync(join(root, 'scripts', 'sw-template.js'), 'utf8');
const sw = template
  .replace("'__VERSION__'", JSON.stringify(version || String(Date.now())))
  .replace('const FILES = __FILES__;', `const FILES = ${JSON.stringify(files, null, 2)};`);
if (/= __FILES__|= '__VERSION__'/.test(sw)) {
  throw new Error('sw.js: Platzhalter wurden nicht ersetzt – scripts/sw-template.js prüfen');
}
writeFileSync(join(dist, 'sw.js'), sw);

console.log(`✓ Version ${version.slice(0, 7) || '(ohne Kennung)'} gebaut, ${files.length} Dateien für offline`);
