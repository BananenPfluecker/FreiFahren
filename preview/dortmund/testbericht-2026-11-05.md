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

## Nutzbare private App und Testmeldungen

Die Oberfläche bietet jetzt Verkehrsmitteltabs, eine direkte Linienauswahl, Linienübersicht, Haltestellensuche mit Linienzuordnung und Haltestellenpopups. Ein Meldeformular übernimmt die gewählte Haltestelle, begrenzt Linien auf dort verkehrende Varianten und bietet deren Endpunkte als optionale Fahrtrichtung an. Aktive Meldungen erscheinen als Kartenmarker und im Meldungsbereich; eigene Meldungen lassen sich entfernen.

Die private Sites-App erhält erstmals einen eigenen D1-Speicher. Keine bestehende produktive Datenbank wird angebunden oder verändert. Die GitHub-Pages-Karte bleibt ohne Schreib-API und verweist für Meldungen auf die private App. Das vorhandene Pages-Build kopiert nun auch die neue CSS-Datei.

Geprüft: drei API-Integrationstests mit SQLite-Adapter über die echte Request-Schnittstelle (Erstellen, Abrufen, Löschrechte, Ausblenden nach 60 Minuten, Authentifizierung, Herkunft, ungültige Zuordnungen, Ein-Minuten-Sperre, Wiederholung derselben Anfrage und Konflikte). Browserablauf gegen lokale D1: Hauptbahnhof suchen, Haltestelle öffnen, U41 und Richtung Dortmund Hafen wählen, speichern, nach Neuladen wiederfinden, eigene Meldung entfernen, Linienfilter U41 mit 41 Haltestellen. Diese lokale Testmeldung wurde anschließend entfernt. Veröffentlichung und mobile Nachprüfung werden im Abschlussbericht bewertet.

Grenzen: derzeit private Test-App mit Zugriff nur für den Eigentümer, keine angebundene Community und keine Gewähr für Kontrollfreiheit. Keine erfundenen Sichtungen, Risikowerte oder Nutzerzahlen. Die 258 Varianten bleiben wegen fehlender Shapes schematisch. Alte Meldungen werden nach 60 Minuten ausgeblendet; eine automatische Löschroutine ist noch nicht eingerichtet.

Nach Veröffentlichung: private Seite erfolgreich geöffnet, Meldespeicher meldet „Verbunden“ und beginnt ohne erfundene Meldungen. Mobile Viewports 390×844 und 320×568 ohne horizontalen Überlauf; Hauptbahnhof-Suche, Haltestellenpopup, Meldeformular und U41-Richtungsauswahl erreichbar. Die unteren mobilen Bedienelemente werden oberhalb der ChatGPT-Bearbeitungsleiste positioniert; Dialoge und Meldungsliste halten diesen Bereich frei. Browser-QA ersetzt weiterhin keinen Test auf echten iOS-/Android-Geräten. Schreibabläufe wurden in der lokalen D1-Umgebung getestet; auf der veröffentlichten Seite wurden keine erfundenen Kontrollsichtungen eingetragen.

## Rückmeldungen, Zusammenführen und freiwillige Hinweise

Ergänzt: „Noch da“, „Nicht mehr da“, „Unsicher“, letzte Sichtung/weitere Bestätigung, Anzahl sichtender Anmeldungen, widersprüchlicher/beendeter Status und optionale Anzeige beendeter Meldungen. Passende Haltepunkte gleicher Bezeichnung innerhalb 150 m werden bei gleicher Linie und Richtung zu einer Meldung zusammengeführt; gleichzeitige Einreichungen erzeugen keinen zweiten Eintrag. Eine Anmeldung kann die Anzahl positiver Sichtungen nicht mehrfach erhöhen. Zwei verschiedene negative Rückmeldungen nach der letzten Sichtung markieren eine Meldung als beendet. Eine neue positive Sichtung kann sie wieder öffnen. Rücknahme eigener Sichtungen lässt andere Beiträge bestehen.

Die Karte bietet einen zusätzlichen Fahrtrichtungsfilter. Einstellungen ergänzen Hell/Dunkel/System, freiwilligen Standort, Umkreiswahl, Hinweiston, optionale Vibration und Systemhinweise sowie fünfminütige Stummschaltung. Standort bleibt lokal im Browser. Umkreishinweise laufen nur in der sichtbaren App; bei fehlender Verbindung, mehr als 90 Sekunden alten Daten, Standortungenauigkeit über 200 m oder aktivem Stummmodus bleiben sie aus. Geladene Meldungen werden bei Verbindungsfehlern als gespeicherter, möglicherweise veralteter Stand angezeigt. API-Anfragen haben eine Zeitgrenze, damit ein unterbrochener Abruf nicht dauerhaft blockiert.

Validierung: zehn Tests für Request-API und Relevanz-/Warnlogik, einschließlich gleichzeitiger Meldungen, unabhängiger Stimmenzählung, Gegenrichtung, Ablauf/Verlängerung, Unsicherheit, Beendigung/Wiederöffnung, Rücknahme, Authentifizierung, Anfragewiederholung und Verbindungs-/Standortbedingungen. Zusätzlich wurde eine Sichtung über die vorherige API erzeugt und nach Migration über die neue API erfolgreich zusammengeführt, ohne direkte Testdateneinfügungen.

Browser gegen lokale D1: Sichtung Hauptbahnhof/U41/Richtung Hafen, Filter in Gegenrichtung (kein Treffer), zurück zu Hafen, Unsicher (Laufzeit unverändert), Nicht mehr da (widersprüchlich), eigene Sichtung zurückgezogen und nach Neustart keine Testmeldung mehr vorhanden. Einstellungen/Theme und ausgeschalteter Standort korrekt. Es wurde keine echte Geräteposition freigegeben; GPS, Systembenachrichtigungen und Vibration sind daher nicht auf echter Hardware nachgetestet. Erweiterungsinterne Meldungen in der Browserkonsole wurden von App-Fehlern unterschieden.

Quellbranch bleibt ausschließlich feature/dortmund-city-vrr. Die zusätzliche Schema-Migration betrifft ausschließlich den bereits getrennten privaten Test-App-Speicher; bestehende Produktionssysteme werden nicht angebunden. Die erste Migration und ihre Metadaten bleiben unverändert.
