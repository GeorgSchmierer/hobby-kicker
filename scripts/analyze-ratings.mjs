/**
 * M5 – Wertung prüfen und Stellschrauben vergleichen. Liest nur, ändert nichts.
 *
 * Spielt alle Partien der Gruppe(n) in der richtigen Reihenfolge mit verschiedenen Einstellungen
 * (K, D, Neuling-Faktor, Torstand) nach – ausgehend von den Startwerten der Spieler – und misst,
 * wie gut die vorhergesagte Siegchance getroffen hätte (Brier-Wert: kleiner = besser;
 * 0,25 = so gut wie Münzwurf). Dazu: wie stark sich die Werte je Partie ändern und wie
 * ausgeglichen die Teams waren.
 *
 * Aufruf: node scripts/analyze-ratings.mjs            (verknüpftes Supabase-Projekt)
 *         node scripts/analyze-ratings.mjs --ab 2026-10-01   (nur Spieltage ab diesem Datum)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fromIndex = process.argv.indexOf('--ab');
const from = fromIndex > 0 ? process.argv[fromIndex + 1] : null;

function query(sql) {
  const file = join(mkdtempSync(join(tmpdir(), 'hk-analyze-')), 'q.sql');
  writeFileSync(file, sql);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  // Pfad in Anführungszeichen: unter Windows läuft npx über die Shell
  const out = execSync(`${npx} supabase db query --linked --output-format json -f "${file}"`, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out.slice(out.indexOf('{'))).rows ?? [];
}

// Alle gewerteten Partien mit Aufstellung (team_id aus rating_changes) und Werten davor
const rows = query(`
  select r.group_id, r.seq, r.kind, s.played_on, m.id as match_id, m.team_a, m.team_b,
         m.goals_a, m.goals_b, m.score_a::float as score_a,
         rc.id as rc_id, rc.player_id, rc.team_id,
         rc.defense_before::float as d0, rc.attack_before::float as a0,
         rc.defense_after::float as d1, rc.attack_after::float as a1, rc.games_before
  from public.rating_changes rc
  join public.matches m on m.id = rc.match_id
  join public.results r on r.id = m.result_id
  join public.sessions s on s.id = r.session_id
  ${from ? `where s.played_on >= '${from}'` : ''}
  order by r.seq, m.id, rc.id
`);
const settings = query('select * from public.rating_settings where id = 1')[0];

if (rows.length === 0) {
  console.log('Keine Partien gefunden.');
  process.exit(0);
}

// Partien zusammensetzen
const matches = [];
for (const r of rows) {
  let m = matches.at(-1);
  if (!m || m.id !== r.match_id) {
    m = { id: r.match_id, seq: r.seq, kind: r.kind, playedOn: r.played_on, teamA: r.team_a, scoreA: r.score_a,
      goalDiff: r.goals_a === null ? null : Math.abs(r.goals_a - r.goals_b), a: [], b: [] };
    matches.push(m);
  }
  (r.team_id === r.team_a ? m.a : m.b).push(r);
}

// Startwerte = Werte vor der ersten gewerteten Partie; Spielezähler ebenso
const start = new Map();
for (const r of rows) if (!start.has(r.player_id)) start.set(r.player_id, { d: r.d0, a: r.a0, games: r.games_before });

const clamp = (v) => Math.min(11, Math.max(1, Math.round(v * 100) / 100));

/** Nachspielen mit Einstellungen p; liefert Brier-Wert, mittlere Änderung, Spannweite der Werte */
function replay(p) {
  const state = new Map([...start].map(([id, v]) => [id, { ...v }]));
  let brier = 0;
  let changeSum = 0;
  let changeCount = 0;
  for (const m of matches) {
    const strength = (team) => team.reduce((sum, r) => sum + (state.get(r.player_id).d + state.get(r.player_id).a) / 2, 0);
    const expected = 1 / (1 + 10 ** ((strength(m.b) - strength(m.a)) / p.D));
    brier += (expected - m.scoreA) ** 2;
    const margin = m.goalDiff === null || !p.useGoals ? 1 : Math.min(p.cap, 1 + p.weight * Math.log(1 + m.goalDiff));
    for (const [team, sign] of [[m.a, 1], [m.b, -1]]) {
      for (const r of team) {
        const s = state.get(r.player_id);
        const k = p.K * (s.games < p.newGames ? p.newFactor : 1);
        const delta = sign * k * margin * (m.scoreA - expected);
        s.d = clamp(s.d + delta);
        s.a = clamp(s.a + delta);
        s.games += 1;
        changeSum += Math.abs(delta);
        changeCount += 1;
      }
    }
  }
  const values = [...state.values()].map((s) => (s.d + s.a) / 2);
  return {
    brier: brier / matches.length,
    avgChange: changeSum / changeCount,
    spread: Math.max(...values) - Math.min(...values),
  };
}

const current = {
  K: Number(settings.k),
  D: Number(settings.scale_d),
  newFactor: Number(settings.new_player_factor),
  newGames: Number(settings.new_player_games),
  weight: Number(settings.margin_weight),
  cap: Number(settings.margin_cap),
  useGoals: true,
};

// Überblick
const sessions = new Set(matches.map((m) => m.playedOn)).size;
const draws = matches.filter((m) => m.scoreA === 0.5).length;
const withGoals = matches.filter((m) => m.goalDiff !== null);
const avgGoalDiff = withGoals.reduce((s, m) => s + m.goalDiff, 0) / Math.max(1, withGoals.length);
const favouriteWon = matches.filter((m) => {
  const sa = m.a.reduce((s, r) => s + (r.d0 + r.a0) / 2, 0);
  const sb = m.b.reduce((s, r) => s + (r.d0 + r.a0) / 2, 0);
  return (sa > sb && m.scoreA === 1) || (sb > sa && m.scoreA === 0);
}).length;
const decided = matches.filter((m) => m.scoreA !== 0.5).length;

console.log(`\n=== Überblick ===`);
console.log(`${matches.length} Partien an ${sessions} Tagen, ${start.size} Spieler, ${draws} Unentschieden`);
console.log(`Torstand bei ${withGoals.length} Partien, Ø Tordifferenz ${avgGoalDiff.toFixed(1)}`);
console.log(`Favorit (laut Werten davor) hat ${favouriteWon} von ${decided} entschiedenen Partien gewonnen`);

const base = replay(current);
console.log(`\n=== Aktuelle Einstellungen: K ${current.K}, D ${current.D}, Neuling ×${current.newFactor} (<${current.newGames} Partien), Torstand ${current.weight}/${current.cap} ===`);
console.log(`Brier ${base.brier.toFixed(3)} (Münzwurf 0,250) · Ø Änderung je Partie ±${base.avgChange.toFixed(2)} · Spannweite der Stärken ${base.spread.toFixed(1)}`);

// Vergleich alternativer Einstellungen
const variants = [];
for (const K of [0.1, 0.2, 0.3, 0.4, 0.5]) {
  for (const D of [6, 8, 10, 12, 15]) {
    for (const useGoals of [true, false]) {
      variants.push({ ...current, K, D, useGoals, ...replay({ ...current, K, D, useGoals }) });
    }
  }
}
variants.sort((a, b) => a.brier - b.brier);
console.log(`\n=== Beste Einstellungen (nachgespielt) ===`);
console.table(
  variants.slice(0, 8).map((v) => ({
    K: v.K,
    D: v.D,
    Torstand: v.useGoals ? 'ja' : 'nein',
    Brier: Number(v.brier.toFixed(3)),
    'Ø Änderung': Number(v.avgChange.toFixed(2)),
    Spannweite: Number(v.spread.toFixed(1)),
  }))
);
if (matches.length < 40) {
  console.log(`Achtung: Mit ${matches.length} Partien ist das noch Zufall. Aussagekräftig wird es ab etwa 40–60 Partien.`);
}
