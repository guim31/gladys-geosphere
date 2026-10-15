// -----------------------------------------------------------------------------
// The dashboard widget "GeoSphere weather": the station's readings, the
// temperature curve of the next 24 hours, the warnings and the forecast in
// words. Built from what the last refresh read (no request of its own), in the
// language and the unit system of the dashboard: the core caches the content
// per language and units, pre-localizing it here is the expected design.
//
// Budget of the core: 8 components at most, 2 texts, 6 tiles, 1 focal, 1
// status list. This content uses 8: heading, 4 tiles, chart, status, caption.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { stationLabel, summarizeForecast, warningsAhead } from './geosphere/model.js';
import {
  TEXT,
  WIDGET_TEXT,
  formatNumber,
  formatWhen,
  pickLanguage,
  symbolName,
  warningLabel,
} from './i18n.js';

/** Widget key: forever. */
export const WIDGET_KEY = 'weather';

// Content lifetime: the data moves every 10 minutes; the service also nudges
// the widget after each refresh that changed something.
const TTL_SECONDS = 600;

const LEVEL_COLORS = {
  1: WIDGET_COLORS.WARNING,
  2: WIDGET_COLORS.WARNING,
  3: WIDGET_COLORS.DANGER,
};

const round = (value) => Math.round(value * 10) / 10;

/** Metric values, converted for a dashboard in US units. */
function unitsOf(units) {
  const us = units === 'us';
  return {
    temperature: (celsius) => (us ? round((celsius * 9) / 5 + 32) : celsius),
    temperatureUnit: us ? '°F' : '°C',
    speed: (kmh) => (us ? round(kmh / 1.609344) : kmh),
    speedUnit: us ? 'mph' : 'km/h',
    rain: (mm) => (us ? Math.round((mm / 25.4) * 100) / 100 : mm),
    rainUnit: us ? 'in' : 'mm',
    rainDigits: us ? 2 : 1,
  };
}

const textOnly = (text) => ({
  ttl_seconds: 60,
  components: [{ type: 'text', variant: 'body', text }],
});

/** "3 – 12 °C · 2 mm" */
function dayLine(day, convert, lang) {
  if (day.min === null || day.max === null) {
    return null;
  }
  const n = (value) => formatNumber(value, lang);
  const temperatures = `${n(convert.temperature(day.min))} – ${n(convert.temperature(day.max))} ${convert.temperatureUnit}`;
  return day.precipitation === null
    ? temperatures
    : `${temperatures} · ${formatNumber(convert.rain(day.precipitation), lang, convert.rainDigits)} ${convert.rainUnit}`;
}

/**
 * @param {ReturnType<import('./service.js').createService>['snapshot']} snapshot
 * @param {{ language: string, units: string, now: number, timeZone?: string }} context
 */
export function buildWeatherContent(snapshot, { language, units, now, timeZone }) {
  const lang = pickLanguage(language);
  const t = WIDGET_TEXT[lang];
  const { target, observation, forecast, warnings } = snapshot;
  if (!target || (!target.station && !target.place)) {
    return textOnly(
      target?.problem && TEXT[target.problem] ? TEXT[target.problem][lang] : t.notConfigured,
    );
  }
  if (!observation && !forecast && !warnings) {
    return textOnly(t.waiting);
  }
  const convert = unitsOf(units);
  const components = [
    {
      type: 'text',
      variant: 'heading',
      text: (target.place?.name ?? stationLabel(target.station.name)).slice(0, 40),
    },
  ];

  const values = observation?.values ?? {};
  const tile = (label, value, unit, icon) =>
    value === undefined ? null : { type: 'value', label, value, unit, icon };
  components.push(
    ...[
      tile(
        t.temperature,
        values.temperature === undefined ? undefined : convert.temperature(values.temperature),
        convert.temperatureUnit,
        'thermometer',
      ),
      tile(
        t.humidity,
        values.humidity === undefined ? undefined : Math.round(values.humidity),
        '%',
        'droplet',
      ),
      tile(
        t.wind,
        values.wind_speed === undefined ? undefined : convert.speed(values.wind_speed),
        convert.speedUnit,
        'wind',
      ),
      tile(
        t.gusts,
        values.wind_gust === undefined ? undefined : convert.speed(values.wind_gust),
        convert.speedUnit,
        'wind',
      ),
    ].filter(Boolean),
  );

  const summary = forecast ? summarizeForecast(forecast, now, timeZone) : null;
  if (summary && summary.temperatures.length > 1) {
    components.push({
      type: 'chart',
      chart_type: 'line',
      title: t.forecastChart,
      unit: convert.temperatureUnit,
      series: [
        {
          name: t.temperature,
          points: summary.temperatures.map((point) => ({
            t: new Date(point.time).toISOString(),
            v: convert.temperature(point.value),
          })),
        },
      ],
    });
  }

  const items = [];
  if (warnings) {
    const ahead = warningsAhead(warnings.warnings, now);
    for (const warning of ahead.slice(0, 6)) {
      const inForce = warning.start <= now;
      items.push({
        label: warningLabel(warning, lang).slice(0, 40),
        value:
          `${inForce ? t.until : t.from} ${formatWhen(inForce ? warning.end : warning.start, lang, timeZone, now)}`.slice(
            0,
            40,
          ),
        color: LEVEL_COLORS[warning.level],
        icon: 'alert-triangle',
      });
    }
    if (ahead.length === 0) {
      items.push({
        label: t.warnings,
        value: t.none,
        color: WIDGET_COLORS.SUCCESS,
        icon: 'check-circle',
      });
    }
  }
  if (summary) {
    const condition = symbolName(summary.symbol, lang);
    if (condition) {
      items.push({ label: t.now, value: condition.slice(0, 40), icon: 'cloud' });
    }
    const next24 = dayLine(summary.next24, convert, lang);
    if (next24) {
      items.push({ label: t.next24, value: next24.slice(0, 40), icon: 'clock' });
    }
    const tomorrow = dayLine(summary.tomorrow, convert, lang);
    if (tomorrow) {
      items.push({ label: t.tomorrow, value: tomorrow.slice(0, 40), icon: 'calendar' });
    }
  }
  if (items.length > 0) {
    components.push({ type: 'status', items: items.slice(0, 10) });
  }

  // Attribution asked by the licence of the data (CC BY 4.0).
  const time = observation?.time ? ` · ${formatWhen(observation.time, lang, timeZone, now)}` : '';
  components.push({ type: 'text', variant: 'caption', text: `${t.source}${time}` });
  return { ttl_seconds: TTL_SECONDS, components };
}
