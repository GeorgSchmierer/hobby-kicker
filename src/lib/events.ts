/**
 * Fester Termin und Zu-/Absagen: Lesen aus Supabase, Schreiben über Server-Funktionen
 * (supabase/migrations/…_schedule_rsvp.sql). Rechenlogik steht in schedule.ts.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { berlinToday, nextEvent, type NextEvent, type Rsvp, type Schedule } from './schedule';
import { supabase } from './supabase';

export type ScheduleInfo = {
  schedule: Schedule;
  /** kommende abgesagte Termine */
  cancelled: string[];
};

export async function loadSchedule(groupId: string): Promise<ScheduleInfo | null> {
  const { data, error } = await supabase
    .from('schedules')
    .select('weekday, start_time, location, max_players')
    .eq('group_id', groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: rows, error: cancelError } = await supabase
    .from('event_cancellations')
    .select('event_date')
    .eq('group_id', groupId)
    .gte('event_date', berlinToday());
  if (cancelError) throw cancelError;
  return { schedule: data as Schedule, cancelled: (rows ?? []).map((r) => r.event_date as string) };
}

export async function loadRsvps(groupId: string, date: string): Promise<Rsvp[]> {
  const { data, error } = await supabase
    .from('rsvps')
    .select('player_id, attending, answered_at')
    .eq('group_id', groupId)
    .eq('event_date', date);
  if (error) throw error;
  return (data ?? []) as Rsvp[];
}

export async function saveSchedule(groupId: string, schedule: Schedule): Promise<void> {
  const { error } = await supabase.rpc('save_schedule', {
    p_group: groupId,
    p_weekday: schedule.weekday,
    p_time: schedule.start_time,
    p_location: schedule.location ?? '',
    p_max: schedule.max_players,
  });
  if (error) throw error;
}

export async function deleteSchedule(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_schedule', { p_group: groupId });
  if (error) throw error;
}

export async function setEventCancelled(groupId: string, date: string, cancelled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_event_cancelled', {
    p_group: groupId,
    p_date: date,
    p_cancelled: cancelled,
  });
  if (error) throw error;
}

/** attending = null nimmt die Antwort zurück */
export async function setRsvp(
  groupId: string,
  date: string,
  playerId: string,
  attending: boolean | null
): Promise<void> {
  const { error } = await supabase.rpc('set_rsvp', {
    p_group: groupId,
    p_date: date,
    p_player: playerId,
    p_attending: attending,
  });
  if (error) throw error;
}

export type NextEventState = {
  info: ScheduleInfo | null;
  event: NextEvent | null;
  rsvps: Rsvp[];
};

/**
 * Lädt Serie, nächsten Termin und dessen Zusagen – beim Öffnen des Bildschirms neu.
 * `data` ist null, solange noch geladen wird.
 */
export function useNextEvent(groupId: string) {
  const [state, setState] = useState<(NextEventState & { groupId: string }) | null>(null);

  const reload = useCallback(async () => {
    const info = await loadSchedule(groupId);
    const event = info ? nextEvent(info.schedule, info.cancelled, berlinToday()) : null;
    const rsvps = event ? await loadRsvps(groupId, event.date) : [];
    setState({ groupId, info, event, rsvps });
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      reload().catch((error) => console.warn('Termin konnte nicht geladen werden', error));
    }, [reload])
  );

  return { data: state?.groupId === groupId ? state : null, reload };
}
