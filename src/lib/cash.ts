/**
 * Kassenbuch (TODO D1): Kosten je Spieltag, aufgeteilt auf die Anwesenden, offene Beträge.
 * Nur zum Mitschreiben – keine echten Zahlungen. Aufteilen und Abhaken macht der Server
 * (supabase/migrations/…_cash.sql); splitCents rechnet für die Vorschau genauso.
 */
import { withCache } from './offline-cache';
import { supabase } from './supabase';

export type Share = {
  expense_id: string;
  player_id: string;
  amount_cents: number;
  paid_at: string | null;
};

export type Expense = {
  id: string;
  session_id: string;
  description: string;
  amount_cents: number;
  created_at: string;
  played_on: string;
  shares: Share[];
};

/** Vorschlag für die Beschreibung */
export const DEFAULT_EXPENSE = 'Hallenmiete';

/**
 * Betrag in Cent gleichmäßig aufteilen; die Summe stimmt immer genau.
 * Rest-Cents gehen der Reihe nach an die ersten (in der Reihenfolge von `count`).
 */
export function splitCents(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const rest = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rest ? 1 : 0));
}

/** 1250 → „12,50 €“ */
export function formatEuro(cents: number): string {
  const sign = cents < 0 ? '−' : '';
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100).toLocaleString('de-DE');
  return `${sign}${euros},${String(abs % 100).padStart(2, '0')} €`;
}

/** „60“, „60,50“, „60.5“, „60,50 €“ → Cent (null bei ungültiger Eingabe) */
export function parseEuro(input: string): number | null {
  const cleaned = input.replace(/€/g, '').replace(/\s/g, '');
  const match = cleaned.match(/^(\d{1,5})(?:[.,](\d{1,2}))?$/);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + (match[2] ? Number(match[2].padEnd(2, '0')) : 0);
  return cents > 0 ? cents : null;
}

/** Offene Beträge je Spieler, größter zuerst */
export function openBalances(expenses: Expense[]): { playerId: string; open: number; shares: (Share & { expense: Expense })[] }[] {
  const byPlayer = new Map<string, { playerId: string; open: number; shares: (Share & { expense: Expense })[] }>();
  for (const e of expenses) {
    for (const s of e.shares) {
      if (s.paid_at || s.amount_cents === 0) continue;
      const entry = byPlayer.get(s.player_id) ?? { playerId: s.player_id, open: 0, shares: [] };
      entry.open += s.amount_cents;
      entry.shares.push({ ...s, expense: e });
      byPlayer.set(s.player_id, entry);
    }
  }
  return [...byPlayer.values()].sort((a, b) => b.open - a.open);
}

async function fetchExpenses(filter: { groupId?: string; sessionId?: string }): Promise<Expense[]> {
  let query = supabase
    .from('expenses')
    .select(
      'id, session_id, description, amount_cents, created_at, sessions (played_on), expense_shares (expense_id, player_id, amount_cents, paid_at)'
    )
    .order('created_at', { ascending: false });
  if (filter.groupId) query = query.eq('group_id', filter.groupId);
  if (filter.sessionId) query = query.eq('session_id', filter.sessionId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((e: any) => ({
    id: e.id,
    session_id: e.session_id,
    description: e.description,
    amount_cents: e.amount_cents,
    created_at: e.created_at,
    played_on: e.sessions?.played_on ?? '',
    shares: e.expense_shares ?? [],
  }));
}

export const loadGroupExpenses = (groupId: string) =>
  withCache(`expenses/${groupId}`, () => fetchExpenses({ groupId }));
export const loadSessionExpenses = (sessionId: string) =>
  withCache(`expenses-session/${sessionId}`, () => fetchExpenses({ sessionId }));

export async function addExpense(sessionId: string, description: string, cents: number): Promise<void> {
  const { error } = await supabase.rpc('add_expense', {
    p_session: sessionId,
    p_description: description.trim(),
    p_amount_cents: cents,
  });
  if (error) throw error;
}

/** playerId = null: alle Anteile dieser Kosten */
export async function setSharePaid(expenseId: string, playerId: string | null, paid: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_share_paid', {
    p_expense: expenseId,
    p_player: playerId,
    p_paid: paid,
  });
  if (error) throw error;
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_expense', { p_expense: expenseId });
  if (error) throw error;
}
