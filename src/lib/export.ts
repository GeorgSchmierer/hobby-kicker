/**
 * Daten-Export (TODO D3): alle Daten der Gruppe als Excel (XLSX) oder PDF – als Sicherung und
 * für DSGVO-Auskünfte. Nur Daten der eigenen Gruppe, keine E-Mail-Adressen.
 * Blätter: Spieler, Spieltage, Teams, Ergebnisse, Wertungsverlauf.
 */
import { strToU8, zipSync } from 'fflate';

import { supabase } from './supabase';

export type Sheet = { name: string; header: string[]; rows: (string | number)[][] };

type Raw = {
  groupName: string;
  players: { id: string; name: string; defense: number; attack: number; games_played: number; active: boolean; is_guest: boolean }[];
  sessions: {
    id: string;
    played_on: string;
    teams: { id: string; idx: number; team_players: { player_id: string }[] }[];
    results: {
      id: string;
      seq: number;
      kind: 'match' | 'tournament';
      matches: { id: string; team_a: string; team_b: string; goals_a: number | null; goals_b: number | null; score_a: number }[];
      rating_changes: {
        id: number;
        player_id: string;
        defense_before: number;
        attack_before: number;
        defense_after: number;
        attack_after: number;
      }[];
    }[];
  }[];
};

const COLORS = ['Rot', 'Blau', 'Gelb', 'Lila'];
const num = (v: number) => Math.round(Number(v) * 100) / 100;
const dateDe = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

export async function loadExportData(groupId: string, groupName: string): Promise<Raw> {
  const [playersRes, sessionsRes] = await Promise.all([
    supabase
      .from('players')
      .select('id, name, defense, attack, games_played, active, is_guest')
      .eq('group_id', groupId)
      .order('name'),
    supabase
      .from('sessions')
      .select(
        `id, played_on,
         teams (id, idx, team_players (player_id)),
         results (id, seq, kind,
           matches (id, team_a, team_b, goals_a, goals_b, score_a),
           rating_changes (id, player_id, defense_before, attack_before, defense_after, attack_after))`
      )
      .eq('group_id', groupId)
      .order('played_on'),
  ]);
  if (playersRes.error) throw playersRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  return { groupName, players: (playersRes.data ?? []) as Raw['players'], sessions: (sessionsRes.data ?? []) as Raw['sessions'] };
}

/** Rohdaten → Tabellenblätter (reine Funktion, getestet) */
export function buildSheets(raw: Raw): Sheet[] {
  const name = new Map(raw.players.map((p) => [p.id, p.name]));
  const sessions = [...raw.sessions].sort((a, b) => a.played_on.localeCompare(b.played_on));

  const players: Sheet = {
    name: 'Spieler',
    header: ['Name', 'Abwehr', 'Angriff', 'Gesamt', 'Partien', 'Status'],
    rows: raw.players.map((p) => [
      p.name,
      num(p.defense),
      num(p.attack),
      num((Number(p.defense) + Number(p.attack)) / 2),
      p.games_played,
      p.is_guest ? 'Gast' : p.active ? 'aktiv' : 'inaktiv',
    ]),
  };

  const sessionSheet: Sheet = {
    name: 'Spieltage',
    header: ['Datum', 'Teams', 'Ergebnisse'],
    rows: sessions.map((s) => [dateDe(s.played_on), s.teams.length, s.results.length]),
  };

  const teams: Sheet = {
    name: 'Teams',
    header: ['Datum', 'Team', 'Spieler'],
    rows: sessions.flatMap((s) =>
      [...s.teams]
        .sort((a, b) => a.idx - b.idx)
        .map((t) => [
          dateDe(s.played_on),
          COLORS[t.idx] ?? `Team ${t.idx + 1}`,
          t.team_players.map((tp) => name.get(tp.player_id) ?? '?').sort((a, b) => a.localeCompare(b, 'de')).join(', '),
        ])
    ),
  };

  const results: Sheet = {
    name: 'Ergebnisse',
    header: ['Datum', 'Nr.', 'Art', 'Team A', 'Team B', 'Tore', 'Ergebnis'],
    rows: [],
  };
  const history: Sheet = {
    name: 'Wertungsverlauf',
    header: ['Datum', 'Nr.', 'Spieler', 'Abwehr vorher', 'Abwehr nachher', 'Angriff vorher', 'Angriff nachher'],
    rows: [],
  };

  for (const s of sessions) {
    const color = new Map(s.teams.map((t) => [t.id, COLORS[t.idx] ?? `Team ${t.idx + 1}`]));
    for (const r of [...s.results].sort((a, b) => a.seq - b.seq)) {
      if (r.kind === 'tournament') {
        const winner = color.get(r.matches[0]?.team_a) ?? '?';
        results.rows.push([dateDe(s.played_on), r.seq, 'Turnier', winner, 'alle anderen', '', `${winner} gewinnt das Turnier`]);
      } else {
        const m = r.matches[0];
        if (!m) continue;
        const [a, b] = [color.get(m.team_a) ?? '?', color.get(m.team_b) ?? '?'];
        const score = Number(m.score_a);
        results.rows.push([
          dateDe(s.played_on),
          r.seq,
          'Partie',
          a,
          b,
          m.goals_a !== null ? `${m.goals_a}:${m.goals_b}` : '',
          score === 1 ? `${a} gewinnt` : score === 0 ? `${b} gewinnt` : 'Unentschieden',
        ]);
      }
      for (const c of [...r.rating_changes].sort((x, y) => Number(x.id) - Number(y.id))) {
        history.rows.push([
          dateDe(s.played_on),
          r.seq,
          name.get(c.player_id) ?? '?',
          num(c.defense_before),
          num(c.defense_after),
          num(c.attack_before),
          num(c.attack_after),
        ]);
      }
    }
  }

  return [players, sessionSheet, teams, results, history];
}

// ---------------------------------------------------------------------------
// Excel (XLSX): minimale, gültige Datei aus XML-Teilen, gepackt mit fflate
// ---------------------------------------------------------------------------

const xml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function column(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetXml(sheet: Sheet): string {
  const rows = [sheet.header, ...sheet.rows]
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${column(c)}${r + 1}`;
          const bold = r === 0 ? ' s="1"' : '';
          return typeof value === 'number'
            ? `<c r="${ref}"${bold}><v>${value}</v></c>`
            : `<c r="${ref}" t="inlineStr"${bold}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${rows}</sheetData></worksheet>`;
}

export function toXlsx(sheets: Sheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });
  return zipSync(files);
}

// ---------------------------------------------------------------------------
// PDF (jsPDF + Tabellen)
// ---------------------------------------------------------------------------

export async function toPdf(sheets: Sheet[], groupName: string, dateLabel: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const { autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  sheets.forEach((sheet, i) => {
    if (i > 0) doc.addPage();
    doc.setFontSize(16);
    doc.text(`${groupName} – ${sheet.name}`, 14, 16);
    doc.setFontSize(9);
    doc.text(`Hobby-Kicker · Export vom ${dateLabel}`, 14, 22);
    autoTable(doc, {
      startY: 27,
      head: [sheet.header],
      body: sheet.rows.length ? sheet.rows.map((r) => r.map((v) => (typeof v === 'number' ? String(v).replace('.', ',') : v))) : [['(keine Einträge)']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [27, 138, 60] },
    });
  });
  return doc.output('blob');
}
