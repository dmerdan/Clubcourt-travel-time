import { extractCoordinatesFromGoogleMapsUrl, extractGeocodeCandidates } from "@/lib/coordinates";
import { getGoogleMapsApiKey } from "@/lib/api";
import { TTLCache } from "@/lib/cache";
import { Coordinates, DistancePoint, TravelMode } from "@/lib/types";

const geocodeCache = new TTLCache<Coordinates>(24 * 60 * 60 * 1000);
const distanceCache = new TTLCache<DistancePoint>(60 * 1000);
const shortUrlCache = new TTLCache<string>(24 * 60 * 60 * 1000);
const SHORT_MAPS_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "g.co"]);

interface GeocodeResponse {
  status: string;
  error_message?: string;
  results?: Array<{
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
}

interface DistanceMatrixResponse {
  status: string;
  error_message?: string;
  rows?: Array<{
    elements?: Array<{
      status?: string;
      distance?: {
        value?: number;
      };
      duration?: {
        value?: number;
      };
      duration_in_traffic?: {
        value?: number;
      };
    }>;
  }>;
}

function buildCoordinateKey(coords: Coordinates): string {
  return `${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`;
}

function normalizeUrl(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

function shouldExpandShortMapsUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (!SHORT_MAPS_HOSTS.has(host)) {
    return false;
  }

  if (host === "maps.app.goo.gl") {
    return true;
  }

  const path = url.pathname.toLowerCase();
  return path.includes("/maps") || path.startsWith("/kgs");
}

async function maybeExpandShortMapsUrl(input: string): Promise<string> {
  const trimmed = input.trim();
  const parsed = normalizeUrl(trimmed);
  if (!parsed || !shouldExpandShortMapsUrl(parsed)) {
    return trimmed;
  }

  const cacheKey = parsed.toString();
  const cached = shortUrlCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(parsed, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml"
      }
    });

    const finalUrl = response.url || trimmed;
    shortUrlCache.set(cacheKey, finalUrl);
    return finalUrl;
  } catch {
    return trimmed;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(url: URL): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Google API request failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function geocodeCandidate(candidate: string): Promise<Coordinates | null> {
  const cacheKey = candidate.toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const key = getGoogleMapsApiKey();
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", candidate);
  url.searchParams.set("key", key);

  const payload = await fetchJson<GeocodeResponse>(url);

  if (payload.status === "ZERO_RESULTS") {
    return null;
  }

  if (payload.status !== "OK") {
    throw new Error(payload.error_message || `Geocoding failed with status ${payload.status}.`);
  }

  const location = payload.results?.[0]?.geometry?.location;
  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    return null;
  }

  const coords = { lat: location.lat, lng: location.lng };
  geocodeCache.set(cacheKey, coords);
  return coords;
}

export async function resolveCoordinatesFromInput(input: string): Promise<Coordinates | null> {
  const trimmed = input.trim();
  const expandedInput = await maybeExpandShortMapsUrl(trimmed);

  const parseCandidates = expandedInput === trimmed ? [trimmed] : [expandedInput, trimmed];
  for (const candidate of parseCandidates) {
    const parsed = extractCoordinatesFromGoogleMapsUrl(candidate);
    if (parsed) {
      return parsed;
    }
  }

  const geocodeCandidates = new Set<string>();
  for (const source of parseCandidates) {
    for (const candidate of extractGeocodeCandidates(source)) {
      geocodeCandidates.add(candidate);
    }
  }

  for (const candidate of geocodeCandidates) {
    const geocoded = await geocodeCandidate(candidate);
    if (geocoded) {
      return geocoded;
    }
  }

  return null;
}

export async function getDistanceWithTraffic(
  origin: Coordinates,
  destination: Coordinates,
  mode: TravelMode
): Promise<DistancePoint> {
  const cacheKey = `${buildCoordinateKey(origin)}->${buildCoordinateKey(destination)}:${mode}`;
  const cached = distanceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const key = getGoogleMapsApiKey();
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destinations", `${destination.lat},${destination.lng}`);
  url.searchParams.set("mode", mode);
  url.searchParams.set("departure_time", "now");
  if (mode === "driving") {
    url.searchParams.set("traffic_model", "best_guess");
  }
  url.searchParams.set("key", key);

  const payload = await fetchJson<DistanceMatrixResponse>(url);

  if (payload.status !== "OK") {
    throw new Error(payload.error_message || `Distance Matrix failed with status ${payload.status}.`);
  }

  const element = payload.rows?.[0]?.elements?.[0];
  if (!element) {
    throw new Error("Distance Matrix returned an empty response.");
  }

  if (element.status !== "OK") {
    throw new Error(`Distance Matrix element failed with status ${element.status}.`);
  }

  const distanceMeters = element.distance?.value;
  const durationSeconds = element.duration_in_traffic?.value ?? element.duration?.value;

  if (typeof distanceMeters !== "number" || typeof durationSeconds !== "number") {
    throw new Error("Distance Matrix response is missing distance or duration values.");
  }

  const result: DistancePoint = {
    distance_km: Number((distanceMeters / 1000).toFixed(1)),
    duration_minutes: Number((durationSeconds / 60).toFixed(1))
  };

  distanceCache.set(cacheKey, result);
  return result;
}
