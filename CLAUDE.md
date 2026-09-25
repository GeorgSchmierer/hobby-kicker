# Hobby-Kicker – Projektkonzept

> Diese Datei ist das zentrale Konzept für die App. Claude Code liest sie beim Start.
> Entscheidungen, die im Laufe der Entwicklung fallen, werden hier nachgetragen.

## 1. Worum geht es?

Eine App für Freundesgruppen, die regelmäßig in wechselnder Besetzung zusammen Fußball spielen.
Die App bildet aus den anwesenden Spielern **faire Teams** (2, 3 oder 4 Teams). Nach dem Spiel
bzw. Mini-Turnier wird das Ergebnis eingetragen, und die App passt die Stärkewerte der Spieler
leicht an. Dadurch werden die Teams mit der Zeit immer fairer.

## 2. Zusammenarbeit mit dem Projektinhaber (wichtig für Claude Code)

- Der Projektinhaber **programmiert nicht selbst**. Kommunikation auf **Deutsch**, in einfacher Sprache, ohne Fachjargon (oder mit kurzer Erklärung).
- Arbeite in **kleinen Meilensteinen** (siehe Abschnitt 9). Nach jedem Meilenstein: App starten, zeigen, wie man sie ausprobiert, Feedback abwarten.
- Muss der Projektinhaber selbst etwas tun (Konto anlegen, Befehl ausführen, Knopf klicken), erkläre es **Schritt für Schritt** und sag, was er danach sehen sollte.
- **Vorher fragen** bei allem, was Geld kostet, Konten anlegt, etwas veröffentlicht oder Daten löscht.
- Geheime Schlüssel (z. B. Supabase `service_role`-Key) **niemals** in den Code oder ins Git-Repository. Nur in `.env`-Dateien, die in `.gitignore` stehen.
- Regelmäßig Git-Commits mit verständlichen Nachrichten.
- Neue Entscheidungen hier in dieser Datei unter „Entscheidungslog“ festhalten.

## 3. Plattformen & Technik

| Bereich | Entscheidung |
|---|---|
| App-Framework | **Expo (React Native) mit Expo Router**, TypeScript – aktuelle stabile SDK-Version zu Projektbeginn prüfen |
| Plattformen jetzt | **Web als installierbare App (PWA)** – funktioniert im Browser und per „Zum Homescreen hinzufügen“ auf iPhone und Android |
| Plattformen später | iOS App Store + Google Play Store aus **demselben Code** (Build über EAS in der Cloud, kein Mac nötig) |
| Backend | **Supabase** (Postgres-Datenbank, Login, Row Level Security), Region **EU (Frankfurt)** |
| Datenbank-Änderungen | Als Migrationen im Repository (`supabase/migrations`), mit Supabase CLI |
| Web-Hosting | **Vercel**, Adresse **https://hobby-kicker.vercel.app** – jeder Push auf `main` geht automatisch live |
| Tests | Automatische Tests (Jest) für die Team-Einteilung und die Wertungsanpassung |

Beim Testen auf dem Handy während der Entwicklung: **Expo Go** (QR-Code scannen).

## 4. Nutzer, Rollen und Gruppen

- Eine **Gruppe** = ein Freundeskreis. Eine Person kann in mehreren Gruppen sein.
- Beitritt nur über **Einladungscode** (zufällig, ca. 8 Zeichen, vom Admin neu erzeugbar).
- Rollen pro Gruppe:
  - **Admin**: alles, inkl. Spieler anlegen/löschen, Stärken von Hand ändern, Mitglieder entfernen, Einladungscode erneuern, Ergebnis rückgängig machen.
  - **Mitglied**: Anwesenheit setzen, Teams würfeln, Ergebnisse eintragen, alles ansehen.
- **Spieler ≠ Nutzerkonto**: Nicht jeder Mitspieler muss die App haben. Spieler sind Einträge in der Gruppe; ein Spieler kann optional mit einem Nutzerkonto verknüpft sein.
- **Stärkewerte sind für alle Gruppenmitglieder sichtbar.**

## 5. Funktionen (erste Version)

1. **Anmeldung** per E-Mail-Login-Link (Magic Link) – keine Passwörter.
2. **Gruppe erstellen / beitreten** (Einladungscode).
3. **Spielerverwaltung**: Name/Spitzname, Abwehr 1–11, Angriff 1–11, aktiv/inaktiv.
4. **Spieltag starten**: anwesende Spieler antippen, Anzahl Teams wählen (2, 3 oder 4).
5. **Teams würfeln**: faire Einteilung anzeigen (Teamstärken sichtbar), Button „Neu würfeln“ für eine andere, ebenso faire Variante. Spieler optional von Hand zwischen Teams verschieben.
6. **Ergebnisse eintragen**: pro Partie Sieger oder Unentschieden, Torstand optional. Alternativ nur „Turniersieger“.
7. **Wertung anpassen**: automatisch nach jedem eingetragenen Ergebnis (siehe Abschnitt 7), Änderungen pro Spieler anzeigen (z. B. „Angriff 6,4 → 6,6“).
8. **Verlauf**: vergangene Spieltage mit Teams und Ergebnissen.
9. **Rückgängig**: Admin kann das zuletzt eingetragene Ergebnis zurücknehmen (Wertungen werden zurückgesetzt).
10. **Konto löschen** (für DSGVO / Stores ohnehin nötig).

Oberfläche: Deutsch, für das Handy optimiert, große Buttons (Bedienung am Spielfeldrand), heller und dunkler Modus.

## 6. Faire Team-Einteilung

**Werte je Spieler:** Abwehr `d` und Angriff `a` (1–11, intern als Kommazahl gespeichert, angezeigt mit einer Nachkommastelle). Gesamtstärke `g = (d + a) / 2`.

**Teamgrößen:** möglichst gleich, maximal 1 Spieler Unterschied.

**Ziel:** Die Teams sollen
1. in der **Gesamtstärke** möglichst gleich sein (Summe `g`), und
2. in sich ausgewogen sein – kein Team nur mit Verteidigern oder nur mit Stürmern (Summen von `d` und `a` je Team möglichst ähnlich).

**Bewertung einer Einteilung** (kleiner = fairer):
```
Kosten = 1,0 · Spannweite(Summe g je Team)
       + 0,5 · Spannweite(Summe d je Team)
       + 0,5 · Spannweite(Summe a je Team)
```
(Spannweite = größter minus kleinster Wert. Gewichte sind Startwerte und dürfen angepasst werden.)
Hat ein Team einen Spieler mehr, wird das durch die Summen automatisch berücksichtigt.

**Suche:** Viele zufällige Starteinteilungen, jeweils verbessert durch Tauschen von Spielern zwischen Teams, bis kein Tausch mehr hilft. Die besten, unterschiedlichen Einteilungen werden gesammelt. „Neu würfeln“ wählt zufällig eine davon aus, deren Kosten nah am besten Ergebnis liegen – so gibt es Abwechslung, ohne unfair zu werden. Muss auf dem Handy in unter einer Sekunde laufen (typisch 8–24 Spieler).

**Spätere Idee:** Regeln wie „diese zwei nicht ins selbe Team“.

## 7. Anpassung der Stärkewerte (Elo-ähnlich)

Grundidee: Die App schätzt vor jeder Partie, wie wahrscheinlich ein Sieg ist. Gewinnt der Außenseiter, ändern sich die Werte deutlicher; gewinnt der Favorit, kaum.

Für jede Partie Team A gegen Team B:

- Teamstärke `S = Summe der g` der Spieler im Team.
- Erwartung für A: `E_A = 1 / (1 + 10^((S_B − S_A) / D))`, Startwert `D = 10`.
- Tatsächliches Ergebnis `R_A`: Sieg 1, Unentschieden 0,5, Niederlage 0.
- Torstand-Faktor `M = 1 + 0,5 · ln(1 + Tordifferenz)`, gedeckelt auf 2 (ohne Torstand: `M = 1`).
- Änderung je Spieler in A: `Δ = K · M · (R_A − E_A)`, Team B entsprechend mit umgekehrtem Vorzeichen.
- Startwert `K = 0,3`. Für Spieler mit weniger als 5 gewerteten Partien: `K · 1,5` (neue Spieler finden schneller ihren richtigen Wert).
- Erste Version: `Δ` wird auf **Abwehr und Angriff gleichermaßen** angewendet.
- Werte bleiben immer zwischen 1 und 11.

**Mehr als 2 Teams:** Jede ausgetragene Partie wird einzeln gewertet. Wird nur der Turniersieger eingetragen, zählt das als Sieg des Siegerteams gegen jedes andere Team (die übrigen Teams untereinander werden nicht gewertet).

**Spätere Verfeinerung (mit Torstand):** erzielte Tore beeinflussen eher den Angriff, kassierte Tore eher die Abwehr.

Alle Parameter (`D`, `K`, Gewichte) zentral an einer Stelle im Code halten, damit sie nach den ersten Spieltagen leicht angepasst werden können.

## 8. Datenmodell & Sicherheit

**Tabellen (Vorschlag):**
- `profiles` – Nutzerkonto (Anzeigename)
- `groups` – Name, Einladungscode, erstellt von
- `group_members` – Gruppe, Nutzer, Rolle (`admin` / `member`)
- `players` – Gruppe, Name, Abwehr, Angriff, Anzahl Partien, aktiv, optional verknüpftes Nutzerkonto
- `sessions` – Spieltag (Gruppe, Datum)
- `teams`, `team_players` – Einteilung je Spieltag
- `matches` – Partie (Team A, Team B, Tore optional, Ergebnis, eingetragen von)
- `rating_changes` – je Spieler und Partie: Werte vorher/nachher (für Verlauf und Rückgängig)
- `audit_log` – wer hat wann was geändert

**Sicherheitsregeln:**
- **Row Level Security auf allen Tabellen**: Nutzer sehen und ändern nur Daten von Gruppen, in denen sie Mitglied sind. Nur Admins dürfen Spieler löschen, Stärken von Hand ändern und Mitglieder verwalten.
- **Wertungsanpassung läuft auf dem Server** (Datenbank-Funktion), nicht in der App. Mitglieder dürfen Stärkewerte nicht direkt schreiben.
- Beitritt per Einladungscode über eine Server-Funktion, mit Begrenzung der Fehlversuche.
- In der App nur der öffentliche Supabase-Schlüssel (`anon`), nie der `service_role`-Schlüssel.
- Nur nötige Daten speichern (Spitzname reicht, E-Mail nur fürs Login).
- Vor dem Store-Start: Datenschutzerklärung, Impressum prüfen.

## 9. Meilensteine

- **M0 – Einrichtung:** Node.js, Git, Expo-Projekt, GitHub-Repository. App läuft leer im Browser und in Expo Go.
- **M1 – Prototyp ohne Server:** Spieler anlegen, Anwesenheit, Teams würfeln – Daten erst nur lokal auf dem Gerät. Ziel: Fairness-Logik schnell ausprobieren. Inklusive Tests für die Einteilung.
- **M2 – Supabase:** Login per Link, Gruppen, Einladungscode, Rollen, Sicherheitsregeln. Spieler liegen jetzt online.
- **M3 – Ergebnisse & Wertung:** Ergebnisse eintragen, serverseitige Anpassung, Verlauf, Rückgängig. Inklusive Tests.
- **M4 – Veröffentlichen als installierbare Web-App:** App-Symbol, Manifest, Hosting, eigene Adresse. Freunde einladen.
- **M5 – Feinschliff:** Parameter nach echten Spieltagen anpassen, kleine Statistiken (Siegquote, Formkurve).
- **Später – Stores:** Apple Developer (ca. 99 $/Jahr) und Google Play (einmalig 25 $), EAS Build, Store-Einträge.

## 10. Offene Fragen

- Name der App (Arbeitstitel „Hobby-Kicker“)?
- Soll die App später eine eigene Domain bekommen? (Hosting: Vercel, entschieden)
- Gibt es Unentschieden, oder wird immer ein Sieger ausgespielt?
- Soll ein Spieler sich selbst bewerten dürfen, oder nur der Admin?

## Entscheidungslog

- 2026-09-23: Expo + Supabase gewählt; zuerst installierbare Web-App, später Stores.
- 2026-09-23: Alle Gruppenmitglieder nutzen die App (Login + Einladungscode); Stärkewerte für alle sichtbar.
- 2026-09-23: M0 – Projekt mit Expo SDK 57 (Standard-Vorlage, Expo Router, Bildschirme in `src/app/`) angelegt. Technische Expo-Hinweise für Claude Code stehen in `AGENTS.md`. Beispiel-Bildschirme der Vorlage bleiben bis M1 drin.
- 2026-09-23: M1 – Beispiel-Bildschirme entfernt. Lokaler Speicher mit AsyncStorage (`src/lib/store.tsx`), Team-Logik in `src/lib/teams.ts`, alle Parameter in `src/lib/params.ts`. Stärkewerte werden von Hand in ganzen Schritten eingestellt (Start 6,0; Wunsch Projektinhaber); von Kommawerten springt Plus/Minus zur nächsten ganzen Zahl (8,4 → 8 bzw. 9). Mindestens 2 Spieler pro Team zum Würfeln. Tests mit `npm test`.
- 2026-09-23: M2 – Anmeldung per **E-Mail-Code** (6 Ziffern) statt Magic Link, weil ein Link auf dem iPhone Safari statt der installierten Web-App öffnet (Projektinhaber einverstanden). Supabase-Projekt (Free, siehe Umzug unten). Anwesenheit und Teamanzahl bleiben lokal auf dem Gerät. Web-Ausgabe `single` statt `static`. Datenbank-Tests mit PGlite: `npm run test:db`.
- 2026-09-23: E-Mail-Versand über **Gmail-SMTP** (App-Passwort, Absender georg.schmierer@gmail.com) in Supabase eingerichtet – nötig, weil Supabase die Mail-Vorlagen (Code statt Link) nur mit eigenem SMTP bearbeiten lässt. Vorlagen „Magic link or OTP“ und „Confirm sign up“ enthalten `{{ .Token }}`. Später evtl. Resend mit eigener Domain (M4).
- 2026-09-23: M2 abgeschlossen (Anmeldung, Gruppe, Spieler online, Würfeln getestet vom Projektinhaber).
- 2026-09-23: M3 – Ablauf: Teams würfeln → „Mit diesen Teams spielen“ speichert einen Spieltag → dort beliebig viele Ergebnisse eintragen (Partie mit/ohne Torstand, Unentschieden möglich, oder nur Turniersieger). Wertung komplett in der Datenbank (`rate_match`), Stellschrauben (D, K, Neuling-Faktor, Torstand) in der Tabelle `rating_settings` (eine Zeile, änderbar im Supabase-Dashboard). Spieltage dürfen alle Mitglieder anlegen und Ergebnisse eintragen; Rückgängig nur Admin und nur das jeweils letzte Ergebnis der Gruppe. Spieler mit Verlauf können nicht gelöscht, nur inaktiv gesetzt werden. Datum der Spieltage in deutscher Zeit. Migrationen spielt Claude mit `npx supabase db push` ein (CLI ist angemeldet).
- 2026-09-24: M4 – Hosting bei **Vercel** (kostenlos, verbunden mit GitHub: jeder Push auf `main` geht automatisch live), zunächst kostenlose Adresse `*.vercel.app`, eigene Domain vielleicht später. Build per `vercel.json` (`expo export`, Ausgabe `dist`, alle Pfade → `index.html`). PWA: `public/manifest.json`, `public/index.html` (Meta-Tags, Apple-Symbol), kein Service Worker (Expo rät ab). App-Symbol: weißer Fußball auf Grün, erzeugt mit `node scripts/make-icons.mjs`.
- 2026-09-24: Extras (Wunsch Projektinhaber, ohne den Kern zu verkomplizieren) – Paket 1 „Spielfeld“: Siegchance (gleiche Formel wie Wertung, D aus `rating_settings`), Teams teilen (WhatsApp-Text), Stoppuhr mit selbst erzeugtem Pfiff (`scripts/make-whistle.mjs`, Logik in `src/lib/stopwatch.ts`), Show-Effekte (Einflug-Animation beim Würfeln, Konfetti + Banner nach Ergebnis, lustige Teamnamen – abgeleitet aus der Teamzusammensetzung, daher für alle gleich, ohne Datenbank). Paket 2 „Statistik“: Reiter „Tabelle“ (Rangliste nach Stärke/Siegquote ab 3 Spielen, Auszeichnungen), Spielerprofil (Bilanz, Form, Serien, Stärke-Verlauf, Traumduo/Angstgegner/Lieblingsgegner ab 3 gemeinsamen Spielen) – rein aus vorhandenen Daten (`src/lib/stats.ts`); Turniersieg zählt in der Statistik als EIN Sieg bzw. EINE Niederlage, Unentschieden als halber Sieg. Paket 3 „MVP des Tages“: Tabelle `mvp_votes`, eine änderbare Stimme pro Mitglied und Spieltag, nur für Mitspieler des Tages, Stimmen für alle Mitglieder sichtbar; bei Gleichstand sind alle Gleichplatzierten MVP; Auszeichnung „MVP-Sammler“.
- 2026-09-24: `typedRoutes` abgeschaltet (Routen-Typen wurden vom Dev-Server wiederholt falsch erzeugt); eigene `expo-types.d.ts` statt der automatisch erzeugten `expo-env.d.ts`.
- 2026-09-24: **Ewige Tabelle** (Wunsch Projektinhaber) im Reiter „Tabelle“ → „Ewig“: Sieg 3 Punkte, Unentschieden 1, Niederlage 0; Sortierung Punkte → Siege → weniger Spiele; Filter „Gesamt“ oder einzelnes Jahr; enthält auch inaktive Spieler mit Spielen. Turniersieg = ein Sieg. Platz auch im Spielerprofil.
- 2026-09-24: **Installations-Hilfe** (Bildschirm `/hilfe`, auch ohne Anmeldung erreichbar): erkennt iPhone/Android, Schritt-für-Schritt-Anleitung, Android-„Jetzt installieren“-Knopf (beforeinstallprompt), Warnung bei Links aus WhatsApp & Co. Hinweis-Kasten auf der Anmeldeseite (fest) und im Reiter „Spieltag“ (wegtippbar); Knopf im Reiter „Gruppe“; Einladungstext weist darauf hin.
- 2026-09-24: **Update-Hinweis**: Vercel baut mit `node scripts/build-web.mjs`, das den Git-Commit als Version in die App (`EXPO_PUBLIC_APP_VERSION`) und nach `/version.json` schreibt. Die App prüft beim Zurückholen aus dem Hintergrund und alle 5 Minuten; bei neuer Version Hinweis „🔄 Neue Version verfügbar“ (Tipp = neu laden). Version + „Nach Updates suchen“ im Reiter „Gruppe“.
- 2026-09-24: **Umzug nach Frankfurt**: Das erste Projekt `zsavaywnxywswxttddss` lag versehentlich in Irland (eu-west-1). Neues Projekt **`kuwtqocabvdmtwlemygt` („hobby-kicker-ffm“, eu-central-1 Frankfurt)**; Migrationen eingespielt, alle Daten inkl. Konto mit `node scripts/transfer-data.mjs <alt> <neu>` übertragen (Zeilenzahl und Prüfsumme identisch). CLI ist mit dem neuen Projekt verknüpft. Altes Projekt nach erfolgreichem Test vom Projektinhaber gelöscht (24.09.2026). SMTP im neuen Projekt: Username muss die volle Gmail-Adresse sein; aktives App-Passwort heißt „Supabase Frankfurt (2)“. Code-Länge 6 (Supabase-Standard bei neuen Projekten ist 8).
- 2026-09-24: **Mitglieder verwalten** (Wunsch Projektinhaber): Admins können im Reiter „Gruppe“ bei jedem Mitglied auf „Bearbeiten“ tippen: Anzeigenamen ändern (Server-Funktion `set_member_name`, protokolliert; der Name gehört zum Konto und gilt in allen Gruppen der Person), Mitglied einem Spieler zuordnen (`players.user_id`, höchstens ein Spieler pro Konto und Gruppe, nur Mitglieder derselben Gruppe; wer die Gruppe verlässt, verliert die Zuordnung, der Spieler bleibt). Rolle ändern und Entfernen sind ins Bearbeiten-Feld gewandert. Wer zugeordnet ist, sieht „(du)“ in der Spielerliste und „Mein Spielerprofil“ unter „Mein Konto“. Mitglieder per E-Mail einladen und E-Mail-Adressen ändern bewusst **nicht** umgesetzt (bräuchte den geheimen Schlüssel auf dem Server). Passwörter gibt es keine (Anmeldung per Code).
- 2026-09-25: Neue Feature-Liste in **`TODO.md`** (Pakete A–D, Antworten des Projektinhabers stehen dort).
- 2026-09-25: **A1 Fester Termin + A2 Zu-/Absagen**: eine wöchentliche Serie pro Gruppe (Tabelle `schedules`: Wochentag, Uhrzeit, Ort, optional Höchstzahl), einzelne Termine absagen (`event_cancellations`), Antworten je **Spieler** (nicht je Konto) in `rsvps` – nur „Bin dabei“/„Kann nicht“, kein „Vielleicht“. Termine werden über ihr Datum angesprochen (deutsche Zeit). Schreiben nur über Server-Funktionen (`save_schedule`, `delete_schedule`, `set_event_cancelled`, `set_rsvp`): Serie/Absagen nur Admins; antworten darf jedes Mitglied für sich und für Spieler ohne Konto, Admins für alle. Bei Höchstzahl: Wer zuerst zusagt, ist drin, danach Warteliste (rückt automatisch nach). Wechselt der Wochentag, verfallen kommende Antworten. Startseite: Kasten „📅 Morgen · 19:00 · Ort“ mit Zu-/Absage-Knöpfen (für das zugeordnete Konto); Erinnerung am Vortag/am Tag nur in der App (hervorgehobener Kasten). Am Termintag wird die Anwesenheit einmal pro Gerät mit den Zusagen vorausgefüllt, danach Link „Zusagen übernehmen“. Termin festlegen im Reiter „Gruppe“ → `/termin`, Übersicht eines Termins `/termin/[date]`. Rechenlogik in `src/lib/schedule.ts` (Tests), Serverzugriff in `src/lib/events.ts`.
- 2026-09-25: **A3 Spielplan** (ab 3 Teams) im Spieltag-Bildschirm: Liste der nächsten Partien bis zum Ende der laufenden Runde („Spiel 3: Rot – Gelb, Blau pausiert“), antippen öffnet „Ergebnis eintragen“ mit vorausgewählten Teams (auch der große Knopf wählt die nächste Partie vor). Kein Speichern in der Datenbank: Der Plan wird aus den tatsächlich eingetragenen Partien berechnet und passt sich an, wenn anders gespielt wird (`src/lib/match-plan.ts`, Tests). Regeln: gleich viele Spiele → jeder gegen jeden → wer pausiert hat, spielt → wer zweimal gespielt hat, verschnauft. Bei 3 Teams pausiert nie jemand zweimal hintereinander; bei 4 Teams ist das zusammen mit „jeder gegen jeden“ unmöglich, dort ergeben je zwei Partien eine Runde (passt auch für zwei Plätze gleichzeitig), doppelte Pause nur beim Rundenwechsel.
- 2026-09-25: **A4 Nachzügler**: Im Spieltag bei „Teams“ → „+ Nachzügler“: Spieler wählen, die App schlägt das fairste Team vor (gleiche Kostenfunktion wie beim Würfeln, nur in ein Team mit den wenigsten Spielern) und – nur wenn deutlich fairer (`LATE_PARAMS.swapMinGain` in `params.ts`) – einen Tausch (Nachzügler kommt in Team X, ein Spieler aus X wechselt in ein kleinstes Team). Team auch selbst wählbar. Alle Mitglieder dürfen das (`add_late_player`); wer an dem Tag noch nicht gespielt hat, kann wieder herausgenommen werden (`remove_session_player`). **Datenmodell:** `rating_changes.team_id` hält fest, für welches Team jemand in jeder Partie gespielt hat (bestehende Daten nachgetragen) – das ist die Aufstellung für Verlauf und Statistik; `team_players` ist nur noch die aktuelle Aufstellung. Wertung zählt so nur für die Partien, in denen jemand tatsächlich dabei war. Logik in `src/lib/late.ts` (Tests).
- 2026-09-25: **A5 Offline-Modus** (Projektinhaber: App soll auch ohne Netz starten → Service Worker). **Service Worker** `dist/sw.js`, erzeugt von `scripts/build-web.mjs` aus `scripts/sw-template.js` (Version + Dateiliste): legt alle ~3 MB der App ab; Seitenaufruf erst Netz (max. 4 s), sonst gespeichert; Programmdateien aus dem Speicher; Supabase, `/version.json`, `/sw.js` nie. Registriert in `public/index.html` (nicht auf Port 8081 = Entwicklungsserver). **Warteschlange** `src/lib/outbox.ts`: Spieltag starten und Ergebnisse eintragen gehen immer über sie (sofort senden, ohne Netz später automatisch: bei „online“, beim Zurückholen der App, alle 20 s; Hinweis unten „📶 Offline – 2 Ergebnisse warten auf Netz“ → „Alles gespeichert ✓“). Die App vergibt die IDs selbst; neue Server-Funktionen `start_session_v2`/`record_result_v2` sind idempotent (nochmal senden wertet nicht doppelt). Doppelte Einträge von zwei Handys: jedes Ergebnis trägt die laufende Partie-Nummer (`results.match_no`); gleiche Nummer + gleiche Paarung (bzw. Turniersieger) → erster Eintrag gewinnt, der zweite wird verworfen mit Hinweis. Wertung weiterhin erst auf dem Server beim Ankommen; wartende Ergebnisse zeigen „⏳ wartet auf Netz“. **Zwischenspeicher** `src/lib/offline-cache.ts` für Profil, Gruppen, Spieler, Spieltage, D; abgelaufene Anmeldung bleibt ohne Netz erhalten (`storedSession`). Online-only bleiben: Rückgängig, Nachzügler, MVP, Zusagen, Statistik. Alte Server-Funktionen bleiben für ältere App-Versionen.
- 2026-09-25: **A6 Gastspieler**: „+ Gast“ im Reiter Spieltag (neben „Alle/Keiner“) und bei „Nachzügler“ → Name + schwach/mittel/stark (`GUEST_LEVELS` in `params.ts`: 4/6/8, Vorauswahl „mittel“ – Wunsch Projektinhaber). Ein Gast ist ein Spieler mit `players.is_guest = true`: anlegen darf jedes Mitglied (`add_guest`, über die Warteschlange, klappt also offline), er wird normal eingeteilt und gewertet (Werte passen sich an, beeinflusst die Wertung der anderen normal), erscheint aber nicht in Spielerliste, Tabelle, Statistik, Auszeichnungen und Zusagen (`withoutGuests` in `stats.ts`). Nach dem Spieltag (sobald ein Ergebnis da ist) fragt der Spieltag-Bildschirm „Gäste übernehmen?“: „Übernehmen“ (nur Admin, mit den aktuellen Werten) oder „Nur Gast“ (ausblenden, `finish_guest`). Gäste werden nicht gelöscht (sonst fehlten sie in den Partien der anderen), nur ausgeblendet; kommt derselbe Name wieder, wird der alte Gast mit seinen Werten eingeblendet. Ungenutzte Gäste lassen sich in der Anwesenheitsliste mit ✕ ausblenden. Paket A damit fertig.
- 2026-09-26: Projektinhaber: „die gesamte Liste durcharbeiten“ (TODO.md, Pakete B–D) – ohne Zwischenstopp nach jedem Paket.
- 2026-09-26: **B1 Avatare**: Standard farbiger Kreis mit Initialen (Farbe fest aus dem Namen, `src/lib/avatars.ts`), optional Foto. Fotos in Supabase Storage, privater Bucket `avatars` (max. 500 KB, jpg/png/webp; Free-Tarif enthält 1 GB, ein Foto ~30 KB → keine Kosten), Pfad `<gruppe>/<spieler>/<zufall>.jpg`, `players.avatar_path`. Sehen nur Gruppenmitglieder (zeitlich begrenzte Links, 24 h), ändern Admin oder der Spieler selbst (verknüpftes Konto; `set_avatar`, Storage-Policies). Foto wird quadratisch zugeschnitten und auf 256 px verkleinert (expo-image-picker, expo-image-manipulator). „📷 Foto hinzufügen/ändern/entfernen“ im Spielerprofil. Beim Löschen von Spieler, Gruppe (letztes Mitglied) oder Konto löscht die App die Fotos mit. Avatare in Spielerliste, Anwesenheit, Würfel-Ergebnis, Spieltag-Teams, Tabelle, Profil.
- 2026-09-26: **B2 Würfel-Animation**: entfällt bei „Bewegung reduzieren“ (Systemeinstellung), Einflug insgesamt höchstens ~0,7 s + Nachfedern, egal wie viele Spieler; „Neu würfeln“ bleibt sofort bedienbar.
- 2026-09-26: **C1 Spielerprofil**: war bereits vorhanden (Werte, Bilanz, Siegquote, Verlaufskurve, „Traumduo“ ab 3 gemeinsamen Spielen); jetzt mit Avatar/Foto.
- 2026-09-26: **C2 Saison-Tabelle** (ersetzt „Ewig“ im Reiter Tabelle → „Saison“): Punkte rechnet der **Server** (`standings(gruppe, von, bis)`), Punkte zentral in `rating_settings` (`points_win` 3, `points_draw` 1, `points_loss` 0). Saisons legt der Admin fest (Tabelle `seasons`: Name, Beginn, Ende; Bildschirm `/saisons` über „Saisons“ in der Tabelle) – Wunsch Projektinhaber: Jahressaison, Beginn/Ende von Hand. Ohne Saisons: Kalenderjahre. Vorausgewählt: laufende Saison/Jahr; dazu „Gesamt“. Spalten: Platz, Spieler, Sp, S, U, N, Ø (Punkte pro Spiel), Pkt. Standard-Sortierung **Punkte** (Punkte → Siege → weniger Spiele), umschaltbar auf „Punkte pro Spiel“ (ab 3 Spielen). Gezählt wird über `rating_changes.team_id` (Nachzügler nur ihre Partien), Turniersieg = ein Sieg, Gäste nicht. Clientseitige `eternalTable` entfernt.
- 2026-09-26: **C3 Abzeichen** (Server, `award_badges` am Ende von `record_result_v2`): Treue Seele (bei den letzten 10 Spieltagen der Gruppe dabei), Siegesserie (5 Siege in Folge), Comeback-König (Sieg mit Siegchance unter 30 %, nachgerechnet aus den Werten vor der Partie), Jubiläum (25/50/100 Spiele). Schwellen zentral in Tabelle `badge_settings`. Tabelle `badges` hängt am Ergebnis (`result_id … on delete cascade`) → „Rückgängig“ nimmt die Abzeichen mit. Jedes Abzeichen einmal pro Spieler (Jubiläum je Stufe), Gäste bekommen keine. Anzeige: im Jubel-Banner nach dem Eintragen („Anna hat ein Abzeichen bekommen: 🔥 Siegesserie“), beim Ergebnis und im Profil. Hinweis: Nur die neue Eintrage-Funktion (v2) vergibt Abzeichen – ältere App-Versionen nicht.
- 2026-09-26: **C5 „Warum hat sich mein Wert geändert?“**: ein Satz je Spieler und Ergebnis (`src/lib/explain.ts`), z. B. „Ihr habt als Außenseiter gewonnen (Siegchance 35 %), deshalb +0,3.“ – mit Torstand-Hinweis ab 2 Toren Unterschied und Neuling-Hinweis; keine Formeln. Siegchance aus den gespeicherten Werten vor der Partie (`rating_changes`, D aus `rating_settings`). Sichtbar beim aufgeklappten Ergebnis im Spieltag und im Profil (letzte 5 Änderungen).
- 2026-09-26: **C6 Anwesenheitsquote**: „18 von 22 · 82 %“ je Spieler (`attendance` in `stats.ts`). Ein Spieltag zählt, wenn an dem Tag gespielt wurde (Session mit Ergebnis); dabei ist, wer mindestens eine Partie gespielt hat (aus `rating_changes`). Abgesagte Termine erzeugen keinen Spieltag und zählen nicht. Gäste nicht aufgeführt. Übersicht im Reiter Tabelle → „Dabei“ (Jahr, darin Monat wählbar), im Profil „Dabei 2026: … (insgesamt …)“.
- 2026-09-26: **C4 Jahresrückblick** (`/rueckblick/[year]`, Einstieg oben im Reiter „Verlauf“): vergangene Jahre immer, das laufende ab Dezember (`REVIEW_FROM_MONTH`). Inhalt: Spieltage, Spiele, Tore; Tabellenerster (vom Server), meiste Spiele, größter Aufsteiger (Summe der Stärke-Änderungen im Jahr), längste Siegesserie, am häufigsten dabei (`src/lib/review.ts`, Tests). Teilen als Bild (Web: selbst gezeichnete Karte 1080×1350 per Canvas, `src/lib/review-image.ts`, ohne zusätzliche Bibliothek; Handy teilt, PC lädt herunter) oder als Text. Paket C damit fertig.
- 2026-09-26: **D2 Admin-Rechte**: mehrere Admins, „Zum Admin“/„Admin entziehen“ gab es schon (nur Admins, nicht die eigene Rolle). Neu: Der letzte Admin einer Gruppe mit weiteren Mitgliedern kann sein **Konto nicht löschen**, bis jemand anderes Admin ist (verständliche Meldung mit Gruppenname; `account_deletion_blocker`, wird in der App vor dem Löschen der Fotos geprüft) – vorher wurde automatisch befördert. Gruppe verlassen war schon gesperrt. Rollenwechsel (`role_changed`) und Entfernen durch Admins (`member_removed`) landen im `audit_log` (Trigger).
- 2026-09-26: **D1 Kassenbuch** (nur Mitschreiben, keine Zahlungen): Tabellen `expenses` (je Spieltag, Beträge in Cent) und `expense_shares` (Anteil je Spieler, `paid_at`). `add_expense` teilt auf alle auf, die an dem Tag in einem Team waren (auch Gäste/Nachzügler): gleich große Anteile, Rest-Cents der Reihe nach an die Ersten (nach Name) → Summe stimmt immer genau (z. B. 60 € / 7 = 1 × 8,58 € + 6 × 8,57 €). Kosten eintragen, löschen und „bezahlt“ abhaken **nur Admins** (Wunsch Projektinhaber); alle Mitglieder sehen es. Im Spieltag Abschnitt „💶 Kosten“ (Vorschau „je 8,57 €“, Namen antippen = bezahlt), Übersicht „Wer schuldet noch wie viel?“ unter Gruppe → „💶 Kasse“ (`/kasse`). Logik/Vorschau in `src/lib/cash.ts` (Tests).
- 2026-09-26: **D3 Daten-Export** (nur Admins, unauffällig im Reiter Gruppe unten: „📦 Daten exportieren“ → `/export`): Die App fragt nach dem Format (Wunsch Projektinhaber: PDF und XLSX). Blätter: Spieler (Werte, Partien, Status inkl. Gast), Spieltage, Teams, Ergebnisse, Wertungsverlauf – nur eigene Gruppe, keine E-Mails (`src/lib/export.ts`, Tests). XLSX selbst erzeugt (XML + Zip mit **fflate**, klein), PDF mit **jsPDF + jspdf-autotable** (werden erst beim Export nachgeladen). Handy: teilen (z. B. „In Dateien sichern“), PC: Download (`src/lib/save-file.ts`). Paket D und damit die ganze `TODO.md` fertig.
- 2026-09-26: Fehler behoben (Rückmeldung Projektinhaber): Fotos erschienen in ständig geöffneten Listen (Reiter „Spieltag“) nie und anderswo erst nach erneutem Öffnen. Ursache: Der React Compiler hat in `useAvatarUrl` das Ergebnis gemerkt, weil der beobachtete Wert (eine Zählnummer) nicht verwendet wurde. Jetzt ist der Link selbst der beobachtete Wert; fehlgeschlagene Link-Abfragen werden nach 5 s wiederholt; nach dem Hochladen wird der Link sofort geholt. Merke: Bei `useSyncExternalStore` immer den zurückgegebenen Wert verwenden.
- 2026-09-26: **M5 begonnen.** Bestand: nur Testeinträge (18 Partien, 23.–25.09., Sekunden-Abstände) → keine Aussage über die Stellschrauben möglich. Auf Wunsch des Projektinhabers **Testdaten zurückgesetzt**: alle Spieltage (mit Ergebnissen, Abzeichen, MVP-Stimmen, Kosten) gelöscht, Stärkewerte auf den Stand vor dem ersten Test, Partien-Zähler 0, Test-Gast gelöscht. Spieler, Fotos, Gruppe, Mitglieder, Termin, Saisons blieben. Sicherung davor: `backups/testdaten-2026-09-26.json` (Ordner `backups/` ist in `.gitignore`). Neues Werkzeug `node scripts/analyze-ratings.mjs [--ab JJJJ-MM-TT]`: spielt alle Partien mit verschiedenen K/D/Torstand-Werten nach und vergleicht, wie gut die Siegchancen treffen (Brier-Wert, 0,25 = Münzwurf), dazu Ø Änderung je Partie und Spannweite der Stärken. **Nächster Schritt M5:** nach ~5–8 echten Spieltagen (40–60 Partien) auswerten und ggf. `rating_settings` anpassen; außerdem Rückmeldungen der Gruppe (Teams gefühlt fair? Werte zu sprunghaft?) einholen.
