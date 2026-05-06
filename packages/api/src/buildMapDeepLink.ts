export interface MapDeepLinkInput {
  lat: number;
  lng: number;
  /** Tile-zoom integer, Google/OSM convention (1-21). The helper converts to
   *  latitudeDelta for the URL — consumers convert back at their end. */
  tileZoom?: number;
  /** Pre-computed latitudeDelta if the caller already has one (e.g. SuggestionCard
   *  produces this directly). Mutually exclusive with tileZoom. */
  latitudeDelta?: number;
  layer?: 'contacts' | 'properties' | 'fieldActivity' | 'buildings' | 'stats';
}

export function buildMapDeepLink({ lat, lng, tileZoom, latitudeDelta, layer }: MapDeepLinkInput): string {
  let delta: number | undefined;
  if (typeof latitudeDelta === 'number') delta = latitudeDelta;
  else if (typeof tileZoom === 'number') {
    const z = tileZoom >= 1 && tileZoom <= 21 ? tileZoom : 13;
    delta = 360 / Math.pow(2, z);
  }
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (delta !== undefined) params.set('zoom', String(delta));
  if (layer) params.set('layer', layer);
  return `?${params.toString()}`;
}
