# Dortmund-Karte: Fehlerbericht und Nachtest

Geprüft am 05.11.2026. Ausgangspunkt: https://bananenpfluecker.github.io/FreiFahren/
Quellbranch ausschließlich `feature/dortmund-city-vrr`. Keine Änderungen an `main`, Produktions-APIs oder Datenbanken. Die vorhandene Branch-Push-Automation kann die unabhängige GitHub-Pages-Testkarte neu veröffentlichen.

Neue private Site: https://freifahren-dortmund-pruefung.bravehost.chatgpt.site

## Befunde und Behebung

| Befund | Ursache / Behebung | Nachtest |
| --- | --- | --- |
| Kartenkacheln liegen auseinander; Kartenebenen und Bedienelemente laufen aus dem Bildschirm | Falsche SRI-Prüfsumme blockierte Leaflet-CSS. Korrekte Prüfsumme eingesetzt. Vorher: Leaflet-Pane `position:static`, Zoom unterhalb von 4.000 px. Nachher: `absolute`. | Kacheln, Linien und Marker korrekt sichtbar; keine Browserwarnungen im Nachtest. |
| Zoomsteuerung kollidiert mit dem Panel | Steuerung nach rechts unten versetzt. | Bei 390×844 und 320×568 im sichtbaren Bereich. |
| Suche zoomt auf komplette Linien statt die gefundene Haltestelle | Bei Namenssuche werden die passenden Haltestellen fokussiert; bedienbare Trefferliste ergänzt. | Dortmund Hauptbahnhof → Dortmund Hbf → anklickbares Popup mit zugehörigen Linien. |
| Gebräuchliche Schreibweisen liefern keine Treffer | Leerzeichen, Bindestriche, Akzente und Großschreibung normalisiert; Hauptbahnhof und Hbf gleichgesetzt. Exakte Liniennummern haben Vorrang vor Teiltreffern. | `U 41` → eine Linie, sechs Varianten, 41 Haltestellen. |
| Filterwechsel/Zurücksetzen lassen ungeeigneten Kartenausschnitt stehen | Ausschnitt neu berechnet, mit Platz für das Panel; Reset ergänzt, Größenänderungen berücksichtigen. | Kombination U41 + Bus ohne Treffer; Reset stellt Gesamtnetz her. |
| Leeres Ergebnis nicht erklärt | Verständliche Meldung und Live-Status ergänzt. | `zzzzzz` → Keine Treffer; Änderungsmöglichkeit genannt. |
| Haltestellen zeigen keine Linienzuordnung | Popup um die aktuell gefilterten Linien ergänzt. | Dortmund Hbf zeigt 13 zugehörige Linien; Castrop-Rauxel Hbf zeigt 480, 481, 482, S2. |
| Mobile Anzeige läuft über oder verdeckt Bedienelemente | Kartenlayout repariert; Panel begrenzt und intern scrollbar; Größenänderungen aktualisieren die Karte. | Kein horizontaler Überlauf bei 320×568, 390×844 und 844×390. |

## Prüfmatrix

| Bereich | Ergebnis |
| --- | --- |
| Gesamtnetz | 72 Linien, 258 Varianten, 1.805 Haltestellen |
| Stadtbahnfilter | 8 Linien, 38 Varianten, 153 Haltestellen |
| Busfilter | 60 Linien, 210 Varianten, 1.681 Haltestellen |
| S-Bahnfilter | 4 Linien, 10 Varianten, 46 Haltestellen |
| Kombinationen / leere Suche | Filter bleiben wirksam; leere Suche und Reset stellen passende Daten wieder her |
| Haltestellensuche / Popup | Hauptbahnhof-Synonym, Trefferwahl und Linienzuordnung geprüft |
| Zoom | Zoomtaste betätigt; Steuerung sichtbar |
| Datenintegrität | Alle 1.805 IDs eindeutig; alle Koordinaten im vorgesehenen Ausschnitt; sämtliche Haltestellenreferenzen aller 258 Varianten vorhanden; jede Variante mindestens zwei Haltestellen |
| JavaScript | `node --check preview/dortmund/app.js` erfolgreich |
| Importerregression | Beide bestehenden Python-Unittests erfolgreich |
| Git-Diff | `git diff --check` erfolgreich |
| Veröffentlichte neue Site | Veröffentlichung erfolgreich; angemeldet geöffnet und mobil nachgetestet; keine erfassten Console-Fehler/Warnungen |

## Grenzen der Prüfung

Die Funktionsbereiche wurden geprüft, aber nicht jede einzelne Haltestelle und jede Linie manuell angeklickt. Datenkonsistenz ist keine Bestätigung der tatsächlichen Vollständigkeit oder Aktualität des VRR-Fahrplans. Die Seite enthält nur schematische Geraden, keine realen Gleis-/Straßenverläufe, Live-Meldungen oder Fahrplanauskunft. Der Datensatz liefert kein präzises Fahrplandatum; der bestehende Hinweis verweist auf den Workflow. Keine Prüfung auf echten iOS-/Android-Geräten, sondern in Chrome mit mobilen Viewports. Netzwerk-/CDN-Ausfälle und Fehlerpfade bei beschädigten Downloads wurden nicht künstlich ausgelöst. Die neue Site nutzt eine Kopie des zu Beginn veröffentlichten JSON-Datensatzes; spätere GitHub-Pages-Builds können einen neu heruntergeladenen Feed verwenden.

## Folgearbeit: GTFS-Streckenverläufe

Die hochgeladene `vrr_gtfs.zip` wurde vollständig importiert. Ihre `shapes.txt` ist 74 Bytes groß und enthält ausschließlich die Kopfzeile, keine Datenpunkte. Ergebnis weiterhin 1.805 Haltestellen, 258 Varianten, 0 Varianten mit GTFS-Geometrie. `feed_info.txt` nennt Version 20261013 und Zeitraum 20260901–20270228; diese Angaben werden jetzt angezeigt.

Der Importer exportiert vorhandene Shapes für das jeweils ausgewählte Muster aus Route, Richtung und Haltestellenfolge. Die häufigste nutzbare Shape wird übernommen, Punkte nach Sequenz sortiert und Abschnitte außerhalb des Kartenbereichs getrennt. Fehlerhafte Koordinaten oder doppelte Punktsequenzen verwerfen die jeweilige Shape. Ohne brauchbare Shape bleibt der Verlauf ausdrücklich schematisch (gestrichelt); die Karte zeigt die Abdeckung der gefilterten Varianten an. Bestehende CSV-Schemata und Datenbanken bleiben unverändert.

Validierung: drei Python-Tests einschließlich Unterfällen für fehlende, leere, ungültige und doppelt sequenzierte Shapes; Export-zu-Browserdaten mit Test-Shape und ohne Sidecars; Trennung bei Gebietsaustritt; kompletter Import der hochgeladenen Datei; JavaScript-Syntax und Diff-Check. Browsernachtest mit Gesamtansicht und U41: korrekter Fahrplanstand, 0/258 bzw. 0/6 Geometrievarianten, Suche und Karte funktionsfähig. Die vorhandene Datei ermöglicht weiterhin keine echten Straßen-/Gleisverläufe. Dafür bleibt ein separat geprüfter Geometriedatensatz erforderlich; die technische Vorbereitung ersetzt diesen nicht.
