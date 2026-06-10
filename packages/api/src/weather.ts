/**
 * Weather client for door-knock prospecting, backed by Open-Meteo.
 *
 * Why Open-Meteo:
 *  - Free for non-commercial-volume use, no API key, no env wiring
 *  - Hourly forecast with precipitation probability — exactly what
 *    "should I knock this afternoon?" needs
 *  - timezone=auto returns local-time ISO strings for the queried coords
 *
 * Caching mirrors geocoding.ts: in-memory map keyed on rounded coords,
 * but with a TTL (forecasts go stale, addresses don't). 2-decimal
 * rounding ≈ 1.1 km — more than fine for weather.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface CurrentWeather {
  /** °C */
  temperature: number;
  /** °C feels-like */
  apparentTemperature: number;
  /** mm in the last hour */
  precipitation: number;
  /** km/h */
  windSpeed: number;
  /** WMO weather code */
  weatherCode: number;
  isDay: boolean;
}

export interface HourlyWeather {
  /** Local-time ISO string for the forecast location, e.g. "2026-06-10T15:00" */
  time: string;
  /** °C */
  temperature: number;
  /** 0–100 */
  precipitationProbability: number;
  /** mm */
  precipitation: number;
  /** km/h */
  windSpeed: number;
  /** WMO weather code */
  weatherCode: number;
}

export interface WeatherForecast {
  current: CurrentWeather;
  /** 48h from the start of today, local time at the forecast location. */
  hourly: HourlyWeather[];
  fetchedAt: number;
}

export type DoorKnockRating = 'good' | 'fair' | 'poor';

export interface DoorKnockAssessment {
  rating: DoorKnockRating;
  /** One-liner for the UI, e.g. "Clear until 4 pm — good knocking window". */
  headline: string;
}

// ── WMO weather-code presentation map ────────────────────────────────

interface WeatherCodeInfo {
  label: string;
  /** MaterialCommunityIcons name (day variant). */
  icon: string;
  /** MaterialCommunityIcons name to use at night. */
  nightIcon?: string;
}

const WEATHER_CODES: Record<number, WeatherCodeInfo> = {
  0: { label: 'Clear', icon: 'weather-sunny', nightIcon: 'weather-night' },
  1: { label: 'Mostly clear', icon: 'weather-sunny', nightIcon: 'weather-night' },
  2: { label: 'Partly cloudy', icon: 'weather-partly-cloudy', nightIcon: 'weather-night-partly-cloudy' },
  3: { label: 'Overcast', icon: 'weather-cloudy' },
  45: { label: 'Fog', icon: 'weather-fog' },
  48: { label: 'Fog', icon: 'weather-fog' },
  51: { label: 'Light drizzle', icon: 'weather-partly-rainy' },
  53: { label: 'Drizzle', icon: 'weather-partly-rainy' },
  55: { label: 'Heavy drizzle', icon: 'weather-rainy' },
  56: { label: 'Freezing drizzle', icon: 'weather-snowy-rainy' },
  57: { label: 'Freezing drizzle', icon: 'weather-snowy-rainy' },
  61: { label: 'Light rain', icon: 'weather-rainy' },
  63: { label: 'Rain', icon: 'weather-rainy' },
  65: { label: 'Heavy rain', icon: 'weather-pouring' },
  66: { label: 'Freezing rain', icon: 'weather-snowy-rainy' },
  67: { label: 'Freezing rain', icon: 'weather-snowy-rainy' },
  71: { label: 'Light snow', icon: 'weather-snowy' },
  73: { label: 'Snow', icon: 'weather-snowy' },
  75: { label: 'Heavy snow', icon: 'weather-snowy-heavy' },
  77: { label: 'Snow grains', icon: 'weather-snowy' },
  80: { label: 'Light showers', icon: 'weather-partly-rainy' },
  81: { label: 'Showers', icon: 'weather-rainy' },
  82: { label: 'Heavy showers', icon: 'weather-pouring' },
  85: { label: 'Snow showers', icon: 'weather-snowy' },
  86: { label: 'Snow showers', icon: 'weather-snowy-heavy' },
  95: { label: 'Thunderstorm', icon: 'weather-lightning' },
  96: { label: 'Thunderstorm + hail', icon: 'weather-lightning-rainy' },
  99: { label: 'Thunderstorm + hail', icon: 'weather-hail' },
};

/** Label + MDI icon for a WMO weather code. Unknown codes fall back to cloudy. */
export function weatherCodeInfo(code: number, isDay = true): { label: string; icon: string } {
  const info = WEATHER_CODES[code] ?? { label: 'Cloudy', icon: 'weather-cloudy' };
  return { label: info.label, icon: !isDay && info.nightIcon ? info.nightIcon : info.icon };
}

// ── Fetch + cache ────────────────────────────────────────────────────

const TTL_MS = 15 * 60 * 1000; // 15 min — forecasts don't move faster than this
const MAX_CACHE_SIZE = 20;

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

const cache = new Map<string, WeatherForecast>();

function pruneCache() {
  if (cache.size <= MAX_CACHE_SIZE) return;
  const toDelete = cache.size - MAX_CACHE_SIZE;
  let count = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    if (++count >= toDelete) break;
  }
}

/**
 * Fetch the current conditions + 48 h hourly forecast for a coordinate.
 * Returns null on network/parse failure — callers should hide weather UI
 * rather than block on it. Cached in-memory for 15 minutes per ~1 km cell.
 */
export async function fetchWeatherForecast(lat: number, lng: number): Promise<WeatherForecast | null> {
  const key = cacheKey(lat, lng);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;

  try {
    const params = [
      `latitude=${lat.toFixed(4)}`,
      `longitude=${lng.toFixed(4)}`,
      'current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day',
      'hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m',
      'forecast_days=2',
      'timezone=auto',
    ].join('&');
    const resp = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!resp.ok) return null;

    const data = await resp.json();
    if (!data?.current || !data?.hourly?.time) return null;

    const hourly: HourlyWeather[] = data.hourly.time.map((time: string, i: number) => ({
      time,
      temperature: data.hourly.temperature_2m[i],
      precipitationProbability: data.hourly.precipitation_probability[i] ?? 0,
      precipitation: data.hourly.precipitation[i] ?? 0,
      windSpeed: data.hourly.wind_speed_10m[i] ?? 0,
      weatherCode: data.hourly.weather_code[i] ?? 3,
    }));

    const forecast: WeatherForecast = {
      current: {
        temperature: data.current.temperature_2m,
        apparentTemperature: data.current.apparent_temperature,
        precipitation: data.current.precipitation ?? 0,
        windSpeed: data.current.wind_speed_10m ?? 0,
        weatherCode: data.current.weather_code ?? 3,
        isDay: data.current.is_day === 1,
      },
      hourly,
      fetchedAt: Date.now(),
    };

    cache.set(key, forecast);
    pruneCache();
    return forecast;
  } catch {
    return null;
  }
}

// ── Door-knock suitability ───────────────────────────────────────────

/** Hours of the day considered knockable (local time, inclusive start / exclusive end). */
export const KNOCK_WINDOW = { startHour: 8, endHour: 19 } as const;

/** Rate a single forecast hour for door-knocking. Pure; unit-testable. */
export function rateHour(h: Pick<HourlyWeather, 'precipitationProbability' | 'precipitation' | 'temperature' | 'windSpeed'>): DoorKnockRating {
  if (
    h.precipitationProbability >= 60 ||
    h.precipitation >= 0.5 ||
    h.temperature <= 5 ||
    h.temperature >= 36 ||
    h.windSpeed >= 45
  ) {
    return 'poor';
  }
  if (
    h.precipitationProbability >= 35 ||
    h.precipitation >= 0.1 ||
    h.temperature <= 9 ||
    h.temperature >= 32 ||
    h.windSpeed >= 30
  ) {
    return 'fair';
  }
  return 'good';
}

function formatHour(iso: string): string {
  const hour = new Date(iso).getHours();
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'am' : 'pm'}`;
}

/**
 * Turn a forecast into a one-line door-knock call for the rest of today.
 *
 * Logic: walk today's remaining knockable hours (8 am–7 pm local).
 *  - Now good  → report how long the window lasts.
 *  - Now fair  → usable, flag the caveat.
 *  - Now poor  → find the next good/fair block today, or call the day off.
 *  - Past 7 pm → preview tomorrow morning.
 *
 * `now` is injectable for tests. Open-Meteo returns local-time ISO strings
 * (timezone=auto), and field reps are physically at the forecast location,
 * so device-local Date comparison is sound.
 */
export function assessDoorKnock(forecast: WeatherForecast, now: Date = new Date()): DoorKnockAssessment {
  const { hourly } = forecast;

  const idxNow = hourly.findIndex(h => {
    const t = new Date(h.time);
    return t.getDate() === now.getDate() && t.getHours() === now.getHours();
  });
  if (idxNow === -1) {
    // Forecast doesn't cover "now" (clock skew / stale cache edge) — fall back to current conditions only.
    const rating = rateHour({ ...forecast.current, precipitationProbability: forecast.current.precipitation > 0 ? 100 : 0 });
    return { rating, headline: weatherCodeInfo(forecast.current.weatherCode).label };
  }

  const inWindow = (h: HourlyWeather) => {
    const hr = new Date(h.time).getHours();
    return hr >= KNOCK_WINDOW.startHour && hr < KNOCK_WINDOW.endHour;
  };
  const sameDay = (h: HourlyWeather, d: Date) => new Date(h.time).getDate() === d.getDate();

  // After hours → preview tomorrow morning (first knockable hours of the next day).
  const nowHour = now.getHours();
  if (nowHour >= KNOCK_WINDOW.endHour) {
    const tomorrowMorning = hourly.filter(h => !sameDay(h, now) && inWindow(h) && new Date(h.time).getHours() < 12);
    if (tomorrowMorning.length === 0) return { rating: 'fair', headline: 'Done for today' };
    const bad = tomorrowMorning.filter(h => rateHour(h) === 'poor');
    return bad.length === 0
      ? { rating: 'good', headline: 'Tomorrow morning looks clear for knocking' }
      : { rating: 'fair', headline: `Rain around ${formatHour(bad[0].time)} tomorrow — knock early` };
  }

  const remainingToday = hourly.slice(idxNow).filter(h => sameDay(h, now) && inWindow(h));
  if (remainingToday.length === 0) return { rating: 'fair', headline: 'Done for today' };

  const ratings = remainingToday.map(rateHour);
  const current = ratings[0];

  if (current !== 'poor') {
    // Find when conditions turn poor.
    const turnIdx = ratings.findIndex(r => r === 'poor');
    if (turnIdx === -1) {
      return current === 'good'
        ? { rating: 'good', headline: 'Clear for the rest of the day — great time to knock' }
        : { rating: 'fair', headline: 'A bit unsettled, but knockable all day' };
    }
    const turnsAt = formatHour(remainingToday[turnIdx].time);
    return {
      rating: current,
      headline: current === 'good'
        ? `Clear until ${turnsAt} — good knocking window`
        : `Knockable until ${turnsAt} — keep an eye on the sky`,
    };
  }

  // Currently poor — when does it open up?
  const opensIdx = ratings.findIndex(r => r !== 'poor');
  if (opensIdx === -1) {
    return { rating: 'poor', headline: 'Wet day out there — good day for call sessions' };
  }
  return { rating: 'poor', headline: `Hold off — clears around ${formatHour(remainingToday[opensIdx].time)}` };
}
