/**
 * Shared display formatters.
 *
 * The dashboard, prospecting tab and session list each had their own copy of
 * these — with subtly different rounding, so the same session could read
 * "0.6 km" on one screen and "0.0 km" on another. One implementation, one
 * answer.
 */

/**
 * Format a distance in metres for display.
 *
 *  - >= 1 km  → "1.2 km"
 *  - < 1 km   → "650 m"  (rounded to the nearest 10 m)
 *  - 0 / null → "0 m"
 */
export function formatDistanceMeters(meters: number | undefined | null): string {
  if (!meters || meters <= 0) return '0 m';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
}

/**
 * Format a duration in seconds for display: "12m", "2h 5m", "0m".
 */
export function formatDurationSeconds(seconds: number | undefined | null): string {
  if (!seconds || seconds <= 0) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}
