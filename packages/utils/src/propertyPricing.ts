import type { Property } from '@realestate-crm/types';

/**
 * Single source of truth for "the dollar amount associated with this property
 * in the pipeline." Three screens used to compute this with subtly different
 * formulas:
 *
 *   - Today's home (index.tsx): `advertised_price ?? appraisal_price ?? 0`
 *   - Pipeline board (pipeline.tsx): `advertised_price ?? appraisal_price ?? 0`
 *   - Stats screen (stats.tsx):     `advertised_price || 0`  (NO appraisal fallback)
 *
 * The Stats variant under-counted: it ignored properties whose price came
 * from an appraisal (`advertised_price` null), and it also dropped any
 * `advertised_price === 0` entry. A user looking at the three views would
 * see three different totals for "active properties." This helper makes
 * them agree.
 *
 * Coalesce order matters:
 *   1. `advertised_price` — the most committed number (what we're publicly
 *      asking) when the property is on market.
 *   2. `appraisal_price` — the back-of-envelope estimate before listing.
 *   3. `0` — neither value present (rare; usually means a stub record).
 *
 * Uses `??` (not `||`) so a legitimate `0` doesn't silently fall through to
 * the next slot — useful if a price field ever stores a true zero (e.g.
 * "make an offer" listing).
 */
export function getPropertyPipelineValue(property: Property): number {
  return property.advertised_price ?? property.appraisal_price ?? 0;
}

/**
 * Sum of pipeline values across a set of properties. Convenience wrapper —
 * use when reducing an already-filtered list.
 */
export function sumPipelineValue(properties: readonly Property[]): number {
  let total = 0;
  for (const p of properties) {
    total += getPropertyPipelineValue(p);
  }
  return total;
}
