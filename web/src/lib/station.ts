/** Same rules as engine/app/dataset.py station_key / locality_key. */

export function normaliseCommon(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "");
}

/** Keep first occurrence. Station names repeat across sheets (赤坂, 東京, …). */
export function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

const SUGGESTION_LIMIT = 8;

/**
 * Names that match what the user has typed, for the station combobox.
 * Empty query returns nothing — listing every station on a phone is unusable.
 */
export function filterStationSuggestions(
  names: string[],
  query: string,
  limit = SUGGESTION_LIMIT,
): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const needle = stationLookupKey(trimmed);
  if (!needle) return [];

  const starts: string[] = [];
  const contains: string[] = [];

  for (const name of uniquePreserveOrder(names)) {
    const key = stationLookupKey(name);
    if (key.startsWith(needle) || name.startsWith(trimmed)) {
      starts.push(name);
    } else if (key.includes(needle) || name.includes(trimmed)) {
      contains.push(name);
    }
    if (starts.length >= limit) break;
  }

  return [...starts, ...contains].slice(0, limit);
}

export function stationLookupKey(value: string): string {
  let text = normaliseCommon(value);
  if (text.length > 1 && text.endsWith("駅")) {
    text = text.slice(0, -1);
  }
  return text.replace(/[・･]/g, "").replace(/[ヶヵ]/g, "ケ");
}

export function localityLookupKey(value: string): string {
  return normaliseCommon(value);
}
