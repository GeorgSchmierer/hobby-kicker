import { useEffect, useState } from 'react';

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
    supabase
      .from('rating_settings')
      .select('scale_d')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.scale_d) {
          cached = Number(data.scale_d);
          setValue(cached);
        }
      });
  }, []);
  return value;
}
