# Test fixtures

Recorded answers of the GeoSphere Austria services, used by the tests instead of the network.

| File                        | Source                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `stations-metadata.json`    | Real answer of `station/current/tawes-v1-10min/metadata`, from the tests of python-zamg (MIT)                                                                                              |
| `station-current.json`      | Real answer of `station/current/tawes-v1-10min` for station 11240, from the tests of python-zamg (MIT)                                                                                     |
| `forecast-metadata.json`    | Real answer of `grid/forecast/nwp-v1-1h-2500m/metadata`, from the tests of python-zamg (MIT)                                                                                               |
| `forecast-graz.json`        | **Built for the tests** in the format of `timeseries/forecast/nwp-v1-1h-2500m` (python-zamg's tests build theirs the same way): 61 hourly steps from 2026-10-14 06:00 UTC, values invented |
| `warnings-salzburg.json`    | Answer of `getWarningsForCoords` for Salzburg, from the tests of ioBroker.weather-warnings (MIT); the third warning was edited there (level 3)                                             |
| `warnings-none.json`        | The same answer without warnings (assumed shape of a quiet day)                                                                                                                            |
| `gladys-feature-table.json` | Category/type couples, units and poll frequencies the Gladys core knows (from the core code)                                                                                               |

`node scripts/probe.mjs <lat> <lon> --save <dir>` writes the live answers of the four endpoints, to
replace the built and assumed files with real ones.
