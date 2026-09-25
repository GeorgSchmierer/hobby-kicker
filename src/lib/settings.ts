import { useEffect, useState } from 'react';

import { withCache } from './offline-cache';
import { supabase } from './supabase';

/** Startwert, falls die Stellschrauben (noch) nicht geladen sind – wie in rating_settings */
const DEFAULT_SCALE_D = 10;
let cached: number | null = null;

/**
 * D aus den Wertungs-Stellschrauben (Tabelle rating_settings) – damit die angezeigte
 * Siegchance immer mit derselben Einstellung rechnet wie die Wertung auf dem Server.
 */
export function useScaleD(): number {
  const [value, setValue] = useState(cached ?? DEFAULT_SCALE_D);
  useEffect(() => {
    if (cached !== null) return;
    // ohne Netz: zuletzt geladener Wert (Offline-Modus)
    withCache('rating-settings', async () => {
      const { data, error } = await supabase.from('rating_settings').select('scale_d').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data?.scale_d ? Number(data.scale_d) : null;
    })
      .then((scaleD) => {
        if (scaleD) {
          cached = scaleD;
          setValue(scaleD);
        }
      })
      .catch(() => {});
  }, []);
  return value;
}
