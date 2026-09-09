/** Public guide slugs map to canonical catalogue names, never environment-specific DB ids. */
import { COURT_GUIDE_NAMES } from "./courtGuideCatalog.ts";
export { COURT_GUIDE_NAMES };
export type CourtGuideSlug = keyof typeof COURT_GUIDE_NAMES;
export function isCourtGuideSlug(value: unknown): value is CourtGuideSlug {
  return typeof value === "string" && Object.hasOwn(COURT_GUIDE_NAMES, value);
}
export function courtGuideHref(name: string): string | null {
  const slug = (Object.keys(COURT_GUIDE_NAMES) as CourtGuideSlug[]).find((key) => COURT_GUIDE_NAMES[key] === name);
  return slug ? `/courts/${slug}/` : null;
}
export function resolveGuideCourt<T extends { id?: unknown; name?: string }>(
  slug: CourtGuideSlug,
  courts: T[]
): T | null {
  const matches = courts.filter((court) => court.name === COURT_GUIDE_NAMES[slug]);
  return matches.length === 1 && Number.isSafeInteger(Number(matches[0].id)) && Number(matches[0].id) > 0
    ? matches[0]
    : null;
}
