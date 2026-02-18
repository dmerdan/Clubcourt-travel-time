import { Coordinates } from "@/lib/types";

const AT_COORDINATES_REGEX = /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/;
const EMBED_COORDINATES_REGEX = /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/;
const LAT_LNG_PAIR_REGEX = /(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/;

function isValidCoordinates(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function toCoordinates(latRaw: string, lngRaw: string): Coordinates | null {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!isValidCoordinates(lat, lng)) {
    return null;
  }

  return { lat, lng };
}

function parseLatLngPair(raw: string): Coordinates | null {
  const match = raw.match(LAT_LNG_PAIR_REGEX);
  if (!match) {
    return null;
  }

  return toCoordinates(match[1], match[2]);
}

export function extractCoordinatesFromGoogleMapsUrl(input: string): Coordinates | null {
  const trimmed = input.trim();

  const atMatch = trimmed.match(AT_COORDINATES_REGEX);
  if (atMatch) {
    const coords = toCoordinates(atMatch[1], atMatch[2]);
    if (coords) {
      return coords;
    }
  }

  const embedMatch = trimmed.match(EMBED_COORDINATES_REGEX);
  if (embedMatch) {
    const coords = toCoordinates(embedMatch[1], embedMatch[2]);
    if (coords) {
      return coords;
    }
  }

  try {
    const url = new URL(trimmed);
    const paramsToCheck = ["q", "query", "ll", "sll", "destination", "origin", "daddr", "saddr"];

    for (const key of paramsToCheck) {
      const value = url.searchParams.get(key);
      if (!value) {
        continue;
      }

      const parsed = parseLatLngPair(value);
      if (parsed) {
        return parsed;
      }
    }

    const pathParsed = parseLatLngPair(decodeURIComponent(url.pathname));
    if (pathParsed) {
      return pathParsed;
    }
  } catch {
    return null;
  }

  return null;
}

function cleanCandidate(value: string): string {
  return value
    .replace(/^loc:/i, "")
    .replace(/\+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractGeocodeCandidates(input: string): string[] {
  const trimmed = input.trim();

  if (!trimmed) {
    return [];
  }

  let url: URL | null = null;
  try {
    url = new URL(trimmed);
  } catch {
    url = null;
  }

  if (!url) {
    return [trimmed];
  }

  const rawCandidates: string[] = [];

  const paramsToCheck = ["q", "query", "destination", "origin", "daddr", "saddr"];
  for (const key of paramsToCheck) {
    const value = url.searchParams.get(key);
    if (value) {
      rawCandidates.push(value);
    }
  }

  const decodedPath = safeDecode(url.pathname);

  const placeMatch = decodedPath.match(/\/place\/([^/]+)/i);
  if (placeMatch?.[1]) {
    rawCandidates.push(placeMatch[1]);
  }

  const searchMatch = decodedPath.match(/\/search\/([^/]+)/i);
  if (searchMatch?.[1]) {
    rawCandidates.push(searchMatch[1]);
  }

  const pathText = decodedPath
    .replace(/\/@.*/, "")
    .replace(/[/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (pathText && pathText !== "/") {
    rawCandidates.push(pathText);
  }

  rawCandidates.push(trimmed);

  const unique = new Set<string>();
  for (const candidate of rawCandidates) {
    const cleaned = cleanCandidate(candidate);
    if (!cleaned) {
      continue;
    }

    if (parseLatLngPair(cleaned)) {
      continue;
    }

    unique.add(cleaned);
  }

  return Array.from(unique);
}
