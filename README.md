# GeoSphere Austria for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that brings the
official weather of **Austria** from [GeoSphere Austria](https://www.geosphere.at) (formerly ZAMG),
the Austrian national weather service: weather station readings, the forecast of its model and the
official weather warnings. Open data, no account, no API key.

> **Not affiliated with GeoSphere Austria.** GeoSphere Austria and ZAMG are names of the Austrian
> weather service; this project only reads its public open data.

> **Developed without access to the live API: feedback welcome.** The development environment could
> not reach the GeoSphere services, so the integration is built and tested against answers
> published by other projects (see [Credits](#credits)). `scripts/probe.mjs` checks the real APIs
> in one command. Please report what works and what does not in the
> [issues](https://github.com/guim31/gladys-geosphere/issues).

## Features

- **Station device**: the 10-minute observations of the nearest TAWES weather station (or the one
  you choose): temperature, dew point, humidity, sea-level pressure, wind speed, gusts and
  direction, rain intensity, sunshine and snow depth.
- **Place device**: at your house, the weather of the coming hour, the minimum, maximum,
  precipitation and strongest gust of the next 24 hours, tomorrow's minimum, maximum and
  precipitation, and the **warning levels** in force (overall and per type: storm, rain, snow,
  black ice, thunderstorm, heat, cold) with a text summary.
- **Scene trigger** _New GeoSphere warning_: as soon as GeoSphere Austria issues a warning for the
  place, or raises its level, often hours before it starts. Filters on type and level; the scene
  receives the type, level, start, end, municipality and the official text.
- **Dashboard widget** _GeoSphere weather_: the station readings, the temperature curve of the next
  24 hours, the warnings in force and announced, the forecast in words; in the language and units
  of the dashboard.
- **Configuration actions**: _List the nearest stations_ (with their distance) and _Check the
  connection_.
- **Read-only**, in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.2.0** or later (the configuration picks a Gladys house).
- A place in Austria. The forecast covers Austria and its neighbours (latitude 43 to 51.8,
  longitude 5.5 to 22.1); the stations and the warnings cover Austria only.
- Internet access from Gladys to `dataset.api.hub.geosphere.at` and `warnungen.zamg.at`.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-geosphere` (or install it from the store).
2. Accept the **location** permission: the integration reads the position of your house to find
   the nearest station and to ask for the forecast and warnings of the place.
3. Open the configuration. Every field is optional: by default the first located house and its
   nearest station are used.
4. In the **Discovery** tab, add the two devices to Gladys.

The user documentation, in four languages, is in [`docs/`](docs/en.md).

## How it works

- **Data Hub** (`dataset.api.hub.geosphere.at/v1`): `station/current/tawes-v1-10min` (station list
  and latest observation) and `timeseries/forecast/nwp-v1-1h-2500m` (hourly forecast at a point).
- **Warnings** (`warnungen.zamg.at/wsapp/api/getWarningsForCoords`): the warnings of the
  municipality of a point, in German or English.
- The container refreshes by itself on a timer (10 minutes by default): the observation and the
  warnings at every refresh, the forecast once an hour, the station list once a day — about 13
  requests an hour, far below the published limits of the Data Hub (5 a second, 240 an hour). The
  devices also declare a one-minute `onPoll`, which only acts if the timer has stalled
  (GladysAssistant/Gladys#3198).
- Only the changed values are published, with a heartbeat every 6 hours. The warnings already
  announced to the scenes are kept in `/data/state.json`, so a restart does not fire them again.

## Limits

- One place and one station per installation.
- The feature names are set when the devices are created, in the configured language.
- The warnings endpoint is the one used by the GeoSphere warnings website; it is not part of the
  documented Data Hub and may change without notice.
- Weather data: © GeoSphere Austria, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  The widget shows the attribution.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
node scripts/probe.mjs 48.21 16.37            # real APIs, read-only
node scripts/probe.mjs 47.07 15.44 --save /tmp/geosphere   # also saves the raw answers
```

The tests run against the SDK's fake Gladys and the recorded answers of
[`test/fixtures`](test/fixtures/README.md); they never touch the network.

Versions and releases belong to the **Release** workflow (Actions → Release): never edit the
`version` of `package.json` or of the manifest by hand. See [`CLAUDE.md`](CLAUDE.md) for the
project rules.

## Credits

- [GeoSphere Austria](https://www.geosphere.at) for the open data and the
  [Data Hub documentation](https://dataset.api.hub.geosphere.at/v1/docs/).
- [python-zamg](https://github.com/killer0071234/python-zamg) by Daniel Gangl (MIT), the library of
  the Home Assistant `zamg` integration: the recorded station metadata and observation, the forecast
  format and the weather symbol list (German and English) come from it.
- The [Home Assistant `zamg` integration](https://github.com/home-assistant/core/tree/dev/homeassistant/components/zamg)
  (Apache-2.0), for the choice of the observed parameters.
- [ioBroker.weather-warnings](https://github.com/ticaki/ioBroker.weather-warnings) by ticaki (MIT):
  the recorded answer of the warnings API and the warning type list.

## License

[Apache-2.0](LICENSE)
