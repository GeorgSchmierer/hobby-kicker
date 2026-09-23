/**
 * Extras rund um den Spieltag: Siegchance, lustige Teamnamen, Text zum Teilen.
 * Reine Rechenfunktionen ohne Datenbank – der Kern (Würfeln, Wertung) bleibt unberührt.
 */

/**
 * Siegchance von Team A gegen Team B – dieselbe Formel wie die Wertung auf dem Server
 * (CLAUDE.md, Abschnitt 7): E_A = 1 / (1 + 10^((S_B − S_A) / D)).
 */
export function winChance(strengthA: number, strengthB: number, scaleD: number): number {
  return 1 / (1 + 10 ** ((strengthB - strengthA) / scaleD));
}

/** Bei mehr als 2 Teams: durchschnittliche Siegchance jedes Teams gegen alle anderen */
export function averageWinChances(strengths: number[], scaleD: number): number[] {
  return strengths.map((s, i) => {
    const others = strengths.filter((_, j) => j !== i);
    if (others.length === 0) return 1;
    return others.reduce((sum, o) => sum + winChance(s, o, scaleD), 0) / others.length;
  });
}

/** „58 %“ */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

export const FUN_TEAM_NAMES = [
  'FC Bierbauch',
  'Real Matratze',
  'Atlético Mikrowelle',
  'Borussia Bratwurst',
  'Inter Mailand-Nord',
  'Dynamo Döner',
  'Sporting Sofa',
  'Rot-Weiß Rasenmäher',
  'Olympique Ohrensessel',
  'FC Wadenkrampf',
  'Hertha Halbzeit',
  'Eintracht Eckfahne',
  'Werder Wegbier',
  'Union Überzahl',
  'SV Seitenaus',
  'Fortuna Fehlpass',
  'Glücksburg Ganzkörper',
  'Lokomotive Lattenkracher',
  'VfB Verlängerung',
  'Bayer Blutgrätsche',
  'TSV Torlos',
  'SC Schienbein',
  'Kickers Kaltgetränk',
  'Alemannia Abseits',
  'Viktoria Volleyschuss',
  'Stahl Stollenschuh',
  'Arminia Aufwärmen',
  'FC Flutlicht',
  'Juventus Jogginghose',
  'Grashüpfer Gurkentruppe',
] as const;

/**
 * Lustige Teamnamen – aus einem „Samen“ (z. B. der Spieltag-ID) abgeleitet,
 * damit alle Mitglieder für denselben Spieltag dieselben Namen sehen. Keine Doppelten.
 */
export function funTeamNames(seed: string, count: number): string[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const pool = [...FUN_TEAM_NAMES];
  const names: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    names.push(pool.splice(h % pool.length, 1)[0]);
  }
  return names;
}

export type ShareTeam = {
  colorName: string;
  emoji: string;
  funName?: string;
  total: number;
  players: string[];
};

/** Fertiger Text für WhatsApp & Co. */
export function teamsShareText(input: {
  groupName: string;
  dateLabel?: string;
  teams: ShareTeam[];
  chances: number[];
  appUrl?: string;
}): string {
  const fmt = (n: number) => n.toFixed(1).replace('.', ',');
  const lines = [`⚽ ${input.groupName}${input.dateLabel ? ` – ${input.dateLabel}` : ''}`, ''];
  input.teams.forEach((team) => {
    lines.push(
      `${team.emoji} *Team ${team.colorName}*${team.funName ? ` „${team.funName}“` : ''} (Stärke ${fmt(team.total)})`
    );
    lines.push(team.players.join(', '));
    lines.push('');
  });
  if (input.teams.length === 2) {
    lines.push(
      `📊 Siegchance: ${input.teams[0].colorName} ${formatPercent(input.chances[0])} – ${formatPercent(input.chances[1])} ${input.teams[1].colorName}`
    );
  } else if (input.teams.length > 2) {
    lines.push(
      `📊 Ø Siegchance: ${input.teams.map((t, i) => `${t.colorName} ${formatPercent(input.chances[i])}`).join(' · ')}`
    );
  }
  if (input.appUrl) lines.push('', `Gewürfelt mit Hobby-Kicker: ${input.appUrl}`);
  return lines.join('\n').trim();
}
