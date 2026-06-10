import { useEffect, useMemo, useState } from 'react';
import { fetchWeatherForecast, assessDoorKnock } from '@realestate-crm/api';
import type { WeatherForecast, DoorKnockAssessment } from '@realestate-crm/api';

interface WeatherState {
  /**
   * Forecast for the given coordinates, or null while loading / after a
   * failed fetch. Callers should hide weather UI when null and not loading —
   * weather is an enhancement, never a blocker.
   */
  forecast: WeatherForecast | null;
  /** Door-knock call derived from the forecast; null whenever forecast is null. */
  assessment: DoorKnockAssessment | null;
  loading: boolean;
}

/**
 * React adapter over the TTL-cached `fetchWeatherForecast` API call —
 * same shape as `useGeocodedAddress`. Null coords skip the request and
 * resolve instantly to a "no data" state, so callers can pass possibly-
 * unavailable GPS coords without guarding.
 */
export function useWeather(
  lat: number | null | undefined,
  lng: number | null | undefined,
): WeatherState {
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState<boolean>(lat != null && lng != null);

  useEffect(() => {
    if (lat == null || lng == null) {
      setForecast(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchWeatherForecast(lat, lng)
      .then(result => {
        if (cancelled) return;
        setForecast(result);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setForecast(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  const assessment = useMemo(
    () => (forecast ? assessDoorKnock(forecast) : null),
    [forecast],
  );

  return { forecast, assessment, loading };
}
