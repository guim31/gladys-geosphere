# GeoSphere Austria

Das amtliche Wetter **Österreichs** in Gladys, von **GeoSphere Austria** (ehemals ZAMG), dem
österreichischen Wetterdienst: die Messwerte der nächsten **TAWES-Wetterstation** alle 10 Minuten,
die **Vorhersage** des 2,5-km-Modells und die **amtlichen Wetterwarnungen** (Sturm, Regen, Schnee,
Glatteis, Gewitter, Hitze, Kälte).

Offene Daten: kein Konto, kein API-Schlüssel. Diese Integration hat keine Verbindung zu GeoSphere
Austria.

> Entwickelt ohne Zugriff auf die echte GeoSphere-API, anhand veröffentlichter Antworten der
> Dienste: Rückmeldungen sind willkommen.

## Überblick

- **Zwei Geräte**: die nächste Station (Temperatur, Luftfeuchtigkeit, Luftdruck, Wind, Böen,
  Regen, Sonnenschein, Schneehöhe) und dein Ort (Vorhersage für die nächsten 24 Stunden und morgen,
  Warnstufen).
- **Ein Szenen-Auslöser**, „Neue GeoSphere-Warnung“, sobald eine Warnung angekündigt wird, oft
  Stunden vor ihrem Beginn.
- **Ein Dashboard-Widget** mit den Messwerten, der Temperaturkurve der nächsten 24 Stunden, den
  Warnungen und der Vorhersage für morgen.
- **Nur lesend**: GeoSphere ist eine Datenquelle, es wird nichts gesteuert.

## Voraussetzungen

- Gladys **5.2.0** oder neuer.
- Ein Ort in **Österreich** (die Vorhersage deckt auch die Nachbargebiete ab, Stationen und
  Warnungen nur Österreich).
- Dein Gladys-Zuhause auf der Karte platziert (**Einstellungen → Zuhause**) oder Koordinaten in der
  Konfiguration.
- Gladys braucht Internetzugang (`dataset.api.hub.geosphere.at` und `warnungen.zamg.at`).

## Konfiguration

Installiere die Integration über **Integrationen → Von GitHub installieren** (oder aus dem Store)
und öffne ihre Konfiguration. Alle Felder sind optional: Standardmäßig nimmt die Integration die
Position deines ersten platzierten Zuhauses, die nächste Station und aktualisiert alle 10 Minuten.

| Feld                       | Zweck                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Zuhause                    | Das Zuhause, dessen Position genutzt wird. Leer: das erste Zuhause mit Position.                                            |
| Breitengrad, Längengrad    | Ein anderer Ort als ein Zuhause, etwa `47,07` und `15,44` (ein Punkt geht auch). Beide oder keiner.                         |
| Wetterstation              | Die ID einer GeoSphere-Station, etwa `11035` (Wien/Hohe Warte). Leer: die nächste.                                          |
| Aktualisierungsintervall   | 10, 15, 30 oder 60 Minuten. Die Stationen melden alle 10 Minuten.                                                           |
| Sprache der Funktionsnamen | Sprache der Funktionsnamen (beim Anlegen der Geräte festgelegt) und der Texte der Szenen-Ereignisse. Standard: Französisch. |

Die Position des Zuhauses wird über die Gladys-Berechtigung `location` gelesen, die bei der
Installation angezeigt wird. Die Position geht nur an GeoSphere Austria, um die Vorhersage und die Warnungen
des Orts abzurufen, und landet nie in den Protokollen.

Öffne danach den Tab **Erkennung** der Integration und füge die beiden Geräte zu Gladys hinzu.

## Geräte

### Station

Der Name ist „GeoSphere“ gefolgt vom Stationsnamen. Werte der letzten 10-Minuten-Messung:

| Funktion                     | Einheit | Hinweis                                                  |
| ---------------------------- | ------- | -------------------------------------------------------- |
| Temperatur                   | °C      | Lufttemperatur in 2 m Höhe                               |
| Taupunkt                     | °C      |                                                          |
| Luftfeuchtigkeit             | %       |                                                          |
| Luftdruck (Meeresniveau)     | hPa     | Auf Meeresniveau reduzierter Luftdruck, wie in Prognosen |
| Windgeschwindigkeit          | km/h    | 10-Minuten-Mittel                                        |
| Windböen                     | km/h    | Stärkste Böe der letzten 10 Minuten                      |
| Windrichtung                 | °       | Woher der Wind kommt: 0 = Nord, 90 = Ost                 |
| Regenintensität              | mm/h    | Regen der letzten 10 Minuten, als Stundenrate            |
| Sonnenschein (letzte 10 min) | min     | 0 bis 10                                                 |
| Schneehöhe                   | cm      |                                                          |

Misst eine Station einen Wert nicht (viele haben keinen Sonnenschein- oder Schneesensor), bleibt die
Funktion leer. Eine Station, die seit mehr als 3 Stunden schweigt, wird nicht mehr als aktuell
veröffentlicht.

### Ort

Der Name ist „GeoSphere“ gefolgt vom Namen des Zuhauses (oder den Koordinaten). Vorhersage des
Modells am Ort und die Warnungen seiner Gemeinde:

| Funktion                  | Einheit | Hinweis                                                            |
| ------------------------- | ------- | ------------------------------------------------------------------ |
| Wetter                    | Text    | Das Wetter der kommenden Stunde, z. B. „Wolkig“                    |
| Minimum nächste 24 h      | °C      |                                                                    |
| Maximum nächste 24 h      | °C      |                                                                    |
| Niederschlag nächste 24 h | mm      |                                                                    |
| Stärkste Böe nächste 24 h | km/h    |                                                                    |
| Minimum morgen            | °C      | Morgen in der Zeitzone von Gladys                                  |
| Maximum morgen            | °C      |                                                                    |
| Niederschlag morgen       | mm      |                                                                    |
| Warnstufe                 | 0 bis 3 | Höchste aktive Stufe: 0 keine, 1 gelb, 2 orange, 3 rot             |
| Sturmwarnung              | 0 bis 3 | Aktive Stufe für diese Art                                         |
| Regenwarnung              | 0 bis 3 |                                                                    |
| Schneewarnung             | 0 bis 3 |                                                                    |
| Glatteiswarnung           | 0 bis 3 |                                                                    |
| Gewitterwarnung           | 0 bis 3 |                                                                    |
| Hitzewarnung              | 0 bis 3 |                                                                    |
| Kältewarnung              | 0 bis 3 |                                                                    |
| Wetterwarnungen           | Text    | Aktive oder angekündigte Warnungen, z. B. „Orange · Sturm → 18:00“ |

Die Stufen sind die **jetzt aktiven**: Eine angekündigte Warnung hebt sie bei ihrem Beginn. Um schon
bei der Ankündigung zu reagieren, nutze den Szenen-Auslöser.

## Widget

**GeoSphere-Wetter** zeigt, in der Sprache und den Einheiten des Dashboards:

- den Namen des Orts, dann Temperatur, Luftfeuchtigkeit, Wind und Böen der Station;
- die Temperaturkurve der nächsten 24 Stunden;
- die aktiven Warnungen (bis wann) und die angekündigten (ab wann), oder eine grüne Zeile „Keine“;
- das Wetter der kommenden Stunde, die nächsten 24 Stunden und morgen (Minimum, Maximum, Regen);
- die Quelle und die Uhrzeit der Messung.

## Szenen-Auslöser

**Neue GeoSphere-Warnung** löst aus, wenn GeoSphere Austria eine Warnung für den Ort ausgibt oder
ihre Stufe erhöht: einmal pro Warnung und Stufe, sobald sie angekündigt ist. Ein Neustart löst nicht
erneut aus. Der allererste Start nimmt die bereits ausgegebenen Warnungen nur zur Kenntnis.

Filter (leer = alle): **Warnarten** (Sturm, Regen, Schnee, Glatteis, Gewitter, Hitze, Kälte) und
**Stufen** (gelb, orange, rot).

An die Szenen-Aktionen übergebene Informationen: Warnart, Stufe, Stufe (1 bis 3), Beginn, Ende,
bereits aktiv, Stufe erhöht, amtlicher Text (auf Deutsch, für die anderen Sprachen auf Englisch) und
Gemeinde. Zum Beispiel eine Nachricht: `GeoSphere: {{triggerEvent.data.type_label}}-Warnung
{{triggerEvent.data.level_label}} von {{triggerEvent.data.starts_at}} bis
{{triggerEvent.data.ends_at}}`.

## Konfigurationsaktionen

- **Nächste Stationen anzeigen**: die 8 aktiven Stationen, die dem Ort am nächsten sind, mit ID,
  Bundesland, Seehöhe und Entfernung. Kopiere eine ID in „Wetterstation“, um eine andere zu wählen
  (eine Station im selben Tal passt oft besser als die nächste hinter einem Berg).
- **Verbindung prüfen**: liest sofort alle Quellen und sagt, was geantwortet hat: die Temperatur der
  Station und ihre Uhrzeit, die Vorhersage, die Anzahl der Warnungen.

## Szenen-Beispiele

- **Sturm im Anmarsch**: Auslöser „Neue GeoSphere-Warnung“, Arten „Sturm“ und „Gewitter“, Stufen
  „Orange“ und „Rot“ → Rollläden schließen, Markise einfahren, Nachricht mit der Beginnzeit senden.
- **Hitzetag**: wenn die Funktion „Hitzewarnung“ größer oder gleich 2 wird → um 10:00 die
  Südrollläden schließen und ans Trinken erinnern.
- **Frost heute Nacht**: jeden Abend um 20:00, wenn „Minimum nächste 24 h“ unter 0 °C liegt →
  benachrichtigen, Pflanzen und Windschutzscheibe zu schützen.

## Fehlerbehebung

- **„Kein Ort“**: Kein Zuhause hat eine Position. Platziere dein Zuhause auf der Karte unter
  **Einstellungen → Zuhause**, gib Koordinaten ein oder wähle eine Station.
- **„Außerhalb des Gebiets von GeoSphere Austria“**: Der Ort liegt außerhalb des Modellgebiets
  (Breite 43 bis 51,8, Länge 5,5 bis 22,1).
- **„GeoSphere Austria antwortet nicht“**: Gladys erreicht den Dienst nicht; die Werte werden
  aktualisiert, sobald er zurück ist. Die Protokolle nennen die fehlerhafte Quelle einmal, und wann
  sie wieder funktioniert.
- **Eine Funktion bleibt leer**: Die Station misst sie nicht. Wähle eine andere Station mit
  **Nächste Stationen anzeigen**.
- **Mehr Details**: Setze die Variable `LOG_LEVEL` des Containers auf `debug`.

## Grenzen

- **Daten**: offene Daten von GeoSphere Austria, Lizenz
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.de) („Quelle: GeoSphere Austria“,
  vom Widget angezeigt).
- **Anfragen**: etwa 13 pro Stunde im Standardtakt (Messung und Warnungen bei jeder
  Aktualisierung, Vorhersage einmal pro Stunde, Stationsliste einmal pro Tag), weit unter den vom
  GeoSphere Data Hub veröffentlichten Grenzen (5 Anfragen pro Sekunde, 240 pro Stunde, zum Zeitpunkt
  der Erstellung).
- Ein Ort und eine Station pro Installation.
- Die Funktionsnamen werden beim Anlegen der Geräte festgelegt: Eine spätere Sprachänderung benennt
  sie nicht um.
- Die Warnungs-API ist die der GeoSphere-Warnseite; GeoSphere kann sie ohne Vorankündigung ändern.
- Entwickelt ohne Zugriff auf die echte API: Die Formate stammen aus den von python-zamg und
  ioBroker.weather-warnings veröffentlichten Antworten. Rückmeldungen sind willkommen.
