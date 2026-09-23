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
| Web-Hosting | Noch offen (z. B. EAS Hosting, Vercel oder Netlify) – mit Projektinhaber entscheiden |
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
- Wo soll die Web-Version gehostet werden, und soll sie eine eigene Domain bekommen?
- Gibt es Unentschieden, oder wird immer ein Sieger ausgespielt?
- Soll ein Spieler sich selbst bewerten dürfen, oder nur der Admin?

## Entscheidungslog

- 2026-09-23: Expo + Supabase gewählt; zuerst installierbare Web-App, später Stores.
- 2026-09-23: Alle Gruppenmitglieder nutzen die App (Login + Einladungscode); Stärkewerte für alle sichtbar.
- 2026-09-23: M0 – Projekt mit Expo SDK 57 (Standard-Vorlage, Expo Router, Bildschirme in `src/app/`) angelegt. Technische Expo-Hinweise für Claude Code stehen in `AGENTS.md`. Beispiel-Bildschirme der Vorlage bleiben bis M1 drin.
