/**
 * Abzeichen (TODO C3). Vergeben werden sie auf dem Server nach jedem Ergebnis
 * (supabase/migrations/…_badges.sql, Schwellen in der Tabelle badge_settings); die App zeigt sie nur.
 */
import { withCache } from './offline-cache';
import { supabase } from './supabase';

export type BadgeKind = 'treue_seele' | 'siegesserie' | 'comeback' | 'jubilaeum';

export type Badge = { player_id: string; kind: BadgeKind; level: number };

const INFO: Record<BadgeKind, { emoji: string; title: string; hint: string }> = {
  treue_seele: { emoji: '🫶', title: 'Treue Seele', hint: '10 Spieltage in Folge dabei' },
  siegesserie: { emoji: '🔥', title: 'Siegesserie', hint: '5 Siege in Folge' },
  comeback: { emoji: '👑', title: 'Comeback-König', hint: 'Sieg als klarer Außenseiter' },
  jubilaeum: { emoji: '🎉', title: 'Jubiläum', hint: 'Spiele insgesamt' },
};

export function badgeEmoji(badge: Pick<Badge, 'kind'>): string {
  return INFO[badge.kind]?.emoji ?? '🏅';
}

/** „Siegesserie“, „Jubiläum: 50 Spiele“ */
export function badgeTitle(badge: Pick<Badge, 'kind' | 'level'>): string {
  const info = INFO[badge.kind];
  if (!info) return 'Abzeichen';
  return badge.kind === 'jubilaeum' ? `${info.title}: ${badge.level} Spiele` : info.title;
}

/** Kurze Erklärung, wofür es das Abzeichen gibt */
export function badgeHint(badge: Pick<Badge, 'kind' | 'level'>): string {
  const info = INFO[badge.kind];
  if (!info) return '';
  return badge.kind === 'jubilaeum' ? `${badge.level} ${info.hint}` : info.hint;
}

/** „Anna hat ein Abzeichen bekommen: 🔥 Siegesserie“ */
export function badgeMessage(name: string, badge: Pick<Badge, 'kind' | 'level'>): string {
  return `${name} hat ein Abzeichen bekommen: ${badgeEmoji(badge)} ${badgeTitle(badge)}`;
}

/** Abzeichen eines Spielers (für das Profil), ältestes zuerst */
export async function loadPlayerBadges(playerId: string): Promise<Badge[]> {
  return withCache(`badges/${playerId}`, async () => {
    const { data, error } = await supabase
      .from('badges')
      .select('player_id, kind, level')
      .eq('player_id', playerId)
      .order('awarded_at');
    if (error) throw error;
    return (data ?? []) as Badge[];
  });
}
