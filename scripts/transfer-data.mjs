/**
 * Überträgt alle Daten von einem Supabase-Projekt in ein anderes (einmaliger Umzug).
 * Nutzt `supabase db query` über die Supabase-Schnittstelle – kein Docker, kein Passwort nötig,
 * nur die Anmeldung der Supabase-Kommandozeile.
 *
 * Aufruf: node scripts/transfer-data.mjs <alte-projekt-ref> <neue-projekt-ref>
 *
 * Voraussetzung: Im neuen Projekt sind alle Migrationen eingespielt und es enthält noch keine Daten.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [oldRef, newRef] = process.argv.slice(2);
if (!oldRef || !newRef) {
  console.error('Aufruf: node scripts/transfer-data.mjs <alte-projekt-ref> <neue-projekt-ref>');
  process.exit(1);
}

// Reihenfolge wegen der Verweise zwischen Tabellen (erst Konten, dann Gruppen usw.)
const TABLES = [
  'auth.users',
  'auth.identities',
  'public.profiles',
  'public.groups',
  'public.group_members',
  'public.players',
  'public.sessions',
  'public.teams',
  'public.team_players',
  'public.results',
  'public.matches',
  'public.rating_changes',
  'public.mvp_votes',
  'public.audit_log',
  'public.invite_attempts',
];

// Tabellen mit automatisch hochgezählten Nummern – danach weiterzählen lassen
const IDENTITY_COLUMNS = [
  ['public.audit_log', 'id'],
  ['public.invite_attempts', 'id'],
  ['public.results', 'seq'],
  ['public.rating_changes', 'id'],
];

const workDir = mkdtempSync(join(tmpdir(), 'hk-transfer-'));
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function query(ref, sql) {
  const file = join(workDir, `q-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(file, sql);
  const out = execFileSync(
    npx,
    ['supabase', 'db', 'query', '--linked', '--project-ref', ref, '--output-format', 'json', '-f', file],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }
  );
  const start = out.indexOf('{');
  return JSON.parse(out.slice(start)).rows ?? [];
}

const count = (ref, table) => Number(query(ref, `select count(*) as n from ${table}`)[0].n);

// 1. Sicherheitscheck: Ziel muss leer sein
for (const table of TABLES) {
  const n = count(newRef, table);
  if (n > 0) {
    console.error(`Abbruch: ${table} im neuen Projekt ist nicht leer (${n} Zeilen).`);
    process.exit(1);
  }
}

// 2. Daten lesen und schreiben
let script = "set session_replication_role = replica;\n";
const expected = {};
for (const table of TABLES) {
  const [schema, name] = table.split('.');
  const rows = query(oldRef, `select coalesce(json_agg(t), '[]'::json) as data from ${table} t`)[0].data;
  expected[table] = rows.length;
  if (rows.length === 0) continue;

  // nur Spalten, die man schreiben darf (keine berechneten), und die es in beiden Projekten gibt
  const columns = query(
    newRef,
    `select column_name, identity_generation from information_schema.columns
     where table_schema = '${schema}' and table_name = '${name}' and is_generated = 'NEVER'
     order by ordinal_position`
  );
  const oldColumns = new Set(Object.keys(rows[0]));
  const cols = columns.filter((c) => oldColumns.has(c.column_name));
  const list = cols.map((c) => `"${c.column_name}"`).join(', ');
  const overriding = cols.some((c) => c.identity_generation === 'ALWAYS') ? ' overriding system value' : '';
  const json = JSON.stringify(rows).replaceAll('$json$', '');
  script += `insert into ${table} (${list})${overriding}\n  select ${list} from json_populate_recordset(null::${table}, $json$${json}$json$);\n`;
}

for (const [table, column] of IDENTITY_COLUMNS) {
  script += `select setval(pg_get_serial_sequence('${table}', '${column}'), coalesce((select max(${column}) from ${table}), 0) + 1, false);\n`;
}
script += "set session_replication_role = origin;\n";

console.log('Übertrage Daten …');
query(newRef, script);

// 3. Kontrolle: gleiche Anzahl Zeilen?
let ok = true;
for (const table of TABLES) {
  const n = count(newRef, table);
  const mark = n === expected[table] ? '✓' : '✗';
  if (n !== expected[table]) ok = false;
  console.log(`${mark} ${table.padEnd(22)} alt ${String(expected[table]).padStart(4)} · neu ${String(n).padStart(4)}`);
}
console.log(ok ? '\nUmzug vollständig.' : '\nACHTUNG: Nicht alle Zeilen sind angekommen!');
process.exit(ok ? 0 : 1);
