/**
 * „Warum hat sich mein Wert geändert?“ (TODO C5): ein kurzer Satz je Wertungsänderung, ohne
 * Formeln – nur Siegchance, Ergebnis und ggf. Torstand. Die Siegchance wird aus den gespeicherten
 * Werten VOR der Partie nachgerechnet (gleiche Formel wie auf dem Server, D aus rating_settings).
 */
import { winChance } from './fun';

export type ExplainMatch = {
  id: string;
  team_a: string;
  team_b: string;
  goals_a: number | null;
  goals_b: number | null;
  score_a: number;
};

export type ExplainChange = {
  match_id: string;
  team_id: string;
  player_id: string;
  defense_before: number;
  attack_before: number;
  defense_after: number;
  attack_after: number;
  games_before: number;
};

/** Unter so vielen Partien gilt man als Neuling (wie new_player_games in rating_settings) */
export const NEW_PLAYER_GAMES = 5;

/** „+0,3“, „−0,05“, „±0,0“ – kleine Änderungen mit zwei Nachkommastellen */
export function formatDelta(delta: number): string {
  const abs = Math.abs(delta);
  const text = (abs < 0.1 && abs >= 0.005 ? abs.toFixed(2) : abs.toFixed(1)).replace('.', ',');
  if (abs < 0.005) return '±0,0';
  return `${delta > 0 ? '+' : '−'}${text}`;
}

const pct = (chance: number) => `${Math.round(chance * 100)} %`;
const strengthOf = (rows: ExplainChange[]) =>
  rows.reduce((sum, r) => sum + (r.defense_before + r.attack_before) / 2, 0);

/** Siegchance des eigenen Teams in einer Partie (aus den Werten vor der Partie) */
function chanceIn(match: ExplainMatch, ownTeam: string, details: ExplainChange[], scaleD: number): number {
  const opp = ownTeam === match.team_a ? match.team_b : match.team_a;
  const rows = details.filter((d) => d.match_id === match.id);
  return winChance(
    strengthOf(rows.filter((d) => d.team_id === ownTeam)),
    strengthOf(rows.filter((d) => d.team_id === opp)),
    scaleD
  );
}

function matchSentence(outcome: 'W' | 'D' | 'L', chance: number, d: string): string {
  const c = `Siegchance ${pct(chance)}`;
  if (outcome === 'W') {
    if (chance < 0.4) return `Ihr habt als Außenseiter gewonnen (${c}), deshalb ${d}.`;
    if (chance > 0.6) return `Ihr wart klarer Favorit und habt gewonnen (${c}), deshalb nur ${d}.`;
    return `Sieg in einer ausgeglichenen Partie (${c}), deshalb ${d}.`;
  }
  if (outcome === 'L') {
    if (chance > 0.6) return `Ihr habt als Favorit verloren (${c}), deshalb ${d}.`;
    if (chance < 0.4) return `Ihr wart Außenseiter (${c}) – die Niederlage kostet nur ${d}.`;
    return `Niederlage in einer ausgeglichenen Partie (${c}), deshalb ${d}.`;
  }
  if (chance > 0.55) return `Unentschieden als Favorit (${c}), deshalb ${d}.`;
  if (chance < 0.45) return `Unentschieden als Außenseiter (${c}), deshalb ${d}.`;
  return `Unentschieden in einer ausgeglichenen Partie, kaum Änderung (${d}).`;
}

/**
 * Erklärungen für alle Spieler eines Ergebnisses: Spieler-ID → Satz.
 * kind 'tournament': mehrere Partien (Sieger gegen jedes andere Team), zusammengefasst.
 */
export function explainResult(
  result: { kind: 'match' | 'tournament'; matches: ExplainMatch[]; details: ExplainChange[] },
  scaleD: number
): Map<string, string> {
  const out = new Map<string, string>();
  const players = [...new Set(result.details.map((d) => d.player_id))];
  for (const pid of players) {
    const mine = result.details.filter((d) => d.player_id === pid);
    const delta = mine.reduce((sum, d) => sum + (d.defense_after - d.defense_before), 0);
    const newbie = Math.min(...mine.map((d) => d.games_before)) < NEW_PLAYER_GAMES;
    let text: string;

    if (result.kind === 'tournament') {
      const winnerTeam = result.matches[0]?.team_a;
      const chances = mine.map((d) => {
        const match = result.matches.find((m) => m.id === d.match_id)!;
        return chanceIn(match, d.team_id, result.details, scaleD);
      });
      const avg = chances.reduce((a, b) => a + b, 0) / Math.max(1, chances.length);
      text =
        mine[0].team_id === winnerTeam
          ? `Turniersieg gegen alle anderen Teams (Siegchance im Schnitt ${pct(avg)}), deshalb ${formatDelta(delta)}.`
          : `Das Turnier hat ein anderes Team gewonnen (eure Siegchance gegen die Sieger ${pct(avg)}), deshalb ${formatDelta(delta)}.`;
    } else {
      const d = mine[0];
      const match = result.matches.find((m) => m.id === d.match_id) ?? result.matches[0];
      const inA = d.team_id === match.team_a;
      const score = inA ? match.score_a : 1 - match.score_a;
      const outcome = score === 1 ? 'W' : score === 0 ? 'L' : 'D';
      text = matchSentence(outcome, chanceIn(match, d.team_id, result.details, scaleD), formatDelta(delta));
      if (match.goals_a !== null && match.goals_b !== null && outcome !== 'D') {
        const [own, other] = inA ? [match.goals_a, match.goals_b] : [match.goals_b, match.goals_a];
        if (Math.abs(own - other) >= 2) text += ` Der deutliche Torstand (${own}:${other}) verstärkt das.`;
      }
    }
    if (newbie) text += ' Als Neuling ändern sich die Werte noch schneller.';
    out.set(pid, text);
  }
  return out;
}
