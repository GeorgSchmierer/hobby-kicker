# Hobby-Kicker – To-Do (neue Features)

> Ergänzung zur `CLAUDE.md`. Alle Regeln von dort gelten weiter. **Oberstes Ziel: Die App bleibt simpel
> und intuitiv.** Der Ablauf Anwesenheit → Teams würfeln → Ergebnis eintragen darf nicht komplizierter werden.
> Reihenfolge: Paket A → B → C → D. Nach jedem Paket App zeigen und Feedback abwarten.
>
> Allgemein: neue Tabellen als Migration mit RLS; Wertungen/Punkte auf dem Server; Parameter zentral;
> Tests für neue Logik; heller/dunkler Modus; Entscheidungen ins Entscheidungslog der `CLAUDE.md`.

## Antworten des Projektinhabers

- A1: Erinnerungen **nur in der App**.
- A2: **Kein „Vielleicht“**.
- A6: Werte von Gästen werden angepasst; Start mit **„mittel“**.
- B1: **Echte Fotos** sollen möglich sein (vorher wegen Speicher/Kosten fragen).
- C2: **Jahressaison**, Beginn und Ende aber **von Hand festlegbar**.
- D1: Kosten eintragen und abhaken **nur Admins**.
- D3: **PDF und XLSX**; vor dem Bau nach dem Format-Wunsch fragen.

## Paket A – Rund um den Spieltag

- [x] **A1 Fester Termin:** Wochentag, Uhrzeit, Ort, optional max. Spieler; „Nächster Termin“ auf der Startseite; einzelne Termine absagen; Erinnerung am Vortag in der App.
- [x] **A2 Zu- und Absagen:** „Bin dabei“ / „Kann nicht“; Übersicht; auch für Spieler ohne Konto; Anwesenheit beim Spieltag vorausgefüllt.
- [x] **A3 Spielplan für 3–4 Teams:** Reihenfolge der Partien, gleich oft spielen, nicht zweimal hintereinander pausieren; Ergebnis direkt im Plan eintragen.
- [x] **A4 Nachzügler einplanen:** Spieler während des Spieltags hinzufügen, fairstes Team vorschlagen (evtl. Tausch); Wertung nur für seine Partien.
- [x] **A5 Offline-Modus:** Ergebnisse zwischenspeichern und später senden; Hinweis „Offline – 2 Ergebnisse warten“; keine doppelte Wertung.
- [x] **A6 Gastspieler:** Name + schwach/mittel/stark; nicht in Tabelle/Statistik; danach „als festen Spieler übernehmen?“.

## Paket B – Optik & Bedienung

- [x] **B1 Avatare:** Initialen-Kreis, optional Foto (Supabase Storage, nur Gruppe sieht es, wird mitgelöscht).
- [x] **B2 Würfel-Animation:** gibt es schon (Einflug); fehlt noch: entfällt bei „Bewegung reduzieren“, max. ~1 Sekunde.

## Paket C – Statistik & Spaß

- [x] **C1 Spielerprofil:** gibt es schon größtenteils (Bilanz, Siegquote, Verlauf, Traumduo); fehlt noch: Avatar (B1).
- [x] **C2 Saison-Tabelle:** Ewige Tabelle mit Jahresfilter gibt es; fehlt: Saisons mit frei wählbarem Start/Ende, Spalte Punkte pro Spiel, Punkte auf dem Server.
- [ ] **C3 Abzeichen:** Treue Seele, Siegesserie, Comeback-König, Jubiläum; serverseitig, bei „Rückgängig“ wieder entfernen.
- [ ] **C4 Jahresrückblick:** Zusammenfassung des Jahres, als Bild teilbar.
- [ ] **C5 „Warum hat sich mein Wert geändert?“:** kurzer Satz je Änderung (Siegchance, Ergebnis, Torstand).
- [ ] **C6 Anwesenheitsquote:** „18 von 22 · 82 %“, nach Monat/Jahr; abgesagte Termine zählen nicht.

## Paket D – Kasse & Verwaltung

- [ ] **D1 Kassenbuch:** Kosten je Spieltag auf Anwesende aufteilen (Cent-genau), offene Beträge, abhaken nur Admins.
- [ ] **D2 Admin-Rechte weitergeben:** mehrere Admins gibt es schon; fehlt: letzter Admin darf Konto nicht löschen ohne Nachfolger, Rollenwechsel ins `audit_log`.
- [ ] **D3 Daten-Export:** PDF und XLSX (vorher Format klären), nur eigene Gruppe, keine E-Mails.
