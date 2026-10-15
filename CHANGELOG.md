# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- GeoSphere Austria (formerly ZAMG) in Gladys: the official Austrian weather, from open data, no
  account and no key.
- A station device with the 10-minute readings of the nearest TAWES weather station (or a chosen
  one): temperature, dew point, humidity, pressure, wind, gusts, wind direction, rain intensity,
  sunshine and snow depth.
- A place device at your house: the weather of the coming hour, the next 24 hours and tomorrow
  (minimum, maximum, precipitation, strongest gust), and the official warning levels in force,
  overall and per type (storm, rain, snow, black ice, thunderstorm, heat, cold).
- The scene trigger "New GeoSphere warning", fired as soon as a warning is issued or raised, with
  filters on type and level.
- The dashboard widget "GeoSphere weather": readings, the temperature curve of the next 24 hours,
  warnings and forecast.
- The configuration actions "List the nearest stations" and "Check the connection".
- English, French, German and Spanish everywhere, documentation included.

[Unreleased]: https://github.com/guim31/gladys-geosphere/commits/main
