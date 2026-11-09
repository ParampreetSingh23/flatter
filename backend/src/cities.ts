import catalogue from "./data/locations.json" with { type: "json" };

// Single static catalogue (docs/locations.md). Stored values are IDs, never labels.
export { catalogue };
export const CITY_IDS = catalogue.cities.map((c) => c.id) as [string, ...string[]];
export const LOCALITY_CITY = new Map(catalogue.cities.flatMap((c) => c.localities.map((l) => [l.id, c.id] as const)));
