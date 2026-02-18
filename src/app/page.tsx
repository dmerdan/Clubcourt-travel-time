"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { TravelMapPoint } from "@/components/TravelMap";
import { Coordinates, Landmark, TravelMode, TravelResult } from "@/lib/types";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MAP_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const TravelMap = dynamic(() => import("@/components/TravelMap"), {
  ssr: false,
  loading: () => (
    <div className="loading-state">
      <div className="spinner" aria-hidden="true" />
      <span>Loading map...</span>
    </div>
  )
});

type SortKey = "none" | "to_landmark" | "to_target";

interface ApiErrorResponse {
  error?: string;
  details?: string;
}

interface TravelApiResponse {
  target: Coordinates;
  mode: TravelMode;
  generatedAt: string;
  results: TravelResult[];
}

const defaultNewLandmark = {
  name: "",
  maps_url: ""
};

function formatDistance(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }

  return `${value.toFixed(1)} km`;
}

function formatDuration(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }

  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(1);
  return `${rounded} min`;
}

function metricSortValue(value: number | null | undefined): number {
  return typeof value === "number" ? value : Number.POSITIVE_INFINITY;
}

function markerLabelFromIndex(index: number): string {
  return MAP_LABELS[index % MAP_LABELS.length];
}

function toCsvValue(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorResponse;
    if (payload.error && payload.details) {
      return `${payload.error} ${payload.details}`;
    }

    if (payload.error) {
      return payload.error;
    }
  } catch {
    // Ignore JSON parse failures and use status message fallback.
  }

  return `Request failed (${response.status})`;
}

export default function HomePage() {
  const [targetInput, setTargetInput] = useState("");
  const [travelMode, setTravelMode] = useState<TravelMode>("driving");
  const [targetCoordinates, setTargetCoordinates] = useState<Coordinates | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string>("");

  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [landmarksLoading, setLandmarksLoading] = useState<boolean>(true);
  const [landmarksError, setLandmarksError] = useState<string>("");

  const [newLandmark, setNewLandmark] = useState(defaultNewLandmark);
  const [landmarkBusyKey, setLandmarkBusyKey] = useState<string>("");
  const [landmarkActionError, setLandmarkActionError] = useState<string>("");

  const [results, setResults] = useState<TravelResult[]>([]);
  const [calculateLoading, setCalculateLoading] = useState<boolean>(false);
  const [calculateError, setCalculateError] = useState<string>("");

  const [sortKey, setSortKey] = useState<SortKey>("none");
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(false);

  const latestSuccessfulRequest = useRef<{ targetInput: string; mode: TravelMode } | null>(null);

  const loadLandmarks = useCallback(async () => {
    setLandmarksLoading(true);
    setLandmarksError("");

    try {
      const response = await fetch("/api/landmarks", {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const payload = (await response.json()) as { landmarks: Landmark[] };
      setLandmarks(payload.landmarks);
    } catch (error) {
      setLandmarksError(error instanceof Error ? error.message : "Failed to load landmarks.");
    } finally {
      setLandmarksLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLandmarks();
  }, [loadLandmarks]);

  const runCalculation = useCallback(async (input: string, mode: TravelMode, silent = false) => {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      if (!silent) {
        setCalculateError("Paste a Google Maps link before calculating.");
      }
      return;
    }

    if (!silent) {
      setCalculateError("");
      setCalculateLoading(true);
    }

    try {
      const response = await fetch("/api/travel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          targetInput: trimmedInput,
          mode
        })
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const payload = (await response.json()) as TravelApiResponse;

      setResults(payload.results);
      setTargetCoordinates(payload.target);
      setGeneratedAt(payload.generatedAt);
      latestSuccessfulRequest.current = {
        targetInput: trimmedInput,
        mode
      };
    } catch (error) {
      if (!silent) {
        setCalculateError(error instanceof Error ? error.message : "Calculation failed.");
      }
    } finally {
      if (!silent) {
        setCalculateLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled) {
      return;
    }

    const interval = setInterval(() => {
      const latest = latestSuccessfulRequest.current;
      if (!latest) {
        return;
      }

      void runCalculation(latest.targetInput, latest.mode, true);
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [autoRefreshEnabled, runCalculation]);

  const onCalculateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runCalculation(targetInput, travelMode);
  };

  const onNewLandmarkSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLandmarkActionError("");
    setLandmarkBusyKey("add");

    try {
      const response = await fetch("/api/landmarks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(newLandmark)
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const payload = (await response.json()) as { landmark: Landmark };
      setLandmarks((previous) => [...previous, payload.landmark]);
      setNewLandmark(defaultNewLandmark);
    } catch (error) {
      setLandmarkActionError(error instanceof Error ? error.message : "Could not add landmark.");
    } finally {
      setLandmarkBusyKey("");
    }
  };

  const onLandmarkFieldChange = (id: string, field: "name" | "maps_url", value: string) => {
    setLandmarks((previous) =>
      previous.map((landmark) => {
        if (landmark.id !== id) {
          return landmark;
        }

        return {
          ...landmark,
          [field]: value
        };
      })
    );
  };

  const onSaveLandmark = async (landmark: Landmark) => {
    setLandmarkActionError("");
    setLandmarkBusyKey(`save:${landmark.id}`);

    try {
      const response = await fetch(`/api/landmarks/${landmark.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: landmark.name,
          maps_url: landmark.maps_url
        })
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const payload = (await response.json()) as { landmark: Landmark };
      setLandmarks((previous) => previous.map((item) => (item.id === payload.landmark.id ? payload.landmark : item)));
    } catch (error) {
      setLandmarkActionError(error instanceof Error ? error.message : `Could not save ${landmark.name}.`);
    } finally {
      setLandmarkBusyKey("");
    }
  };

  const onDeleteLandmark = async (id: string) => {
    setLandmarkActionError("");
    setLandmarkBusyKey(`delete:${id}`);

    try {
      const response = await fetch(`/api/landmarks/${id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      setLandmarks((previous) => previous.filter((landmark) => landmark.id !== id));
    } catch (error) {
      setLandmarkActionError(error instanceof Error ? error.message : "Could not delete landmark.");
    } finally {
      setLandmarkBusyKey("");
    }
  };

  const sortedResults = useMemo(() => {
    if (sortKey === "none") {
      return results;
    }

    const copy = [...results];

    if (sortKey === "to_landmark") {
      copy.sort((a, b) => metricSortValue(a.to_landmark?.duration_minutes) - metricSortValue(b.to_landmark?.duration_minutes));
    }

    if (sortKey === "to_target") {
      copy.sort((a, b) => metricSortValue(a.to_target?.duration_minutes) - metricSortValue(b.to_target?.duration_minutes));
    }

    return copy;
  }, [results, sortKey]);

  const mapPoints = useMemo<TravelMapPoint[]>(() => {
    if (!targetCoordinates || sortedResults.length === 0) {
      return [];
    }

    const landmarksById = new Map(landmarks.map((landmark) => [landmark.id, landmark]));

    return sortedResults.flatMap((row, index) => {
      const landmark = landmarksById.get(row.landmarkId);
      if (!landmark) {
        return [];
      }

      return [
        {
          id: row.landmarkId,
          name: row.landmark,
          label: markerLabelFromIndex(index),
          lat: landmark.lat,
          lng: landmark.lng,
          toLandmarkMinutes: row.to_landmark?.duration_minutes ?? null,
          toTargetMinutes: row.to_target?.duration_minutes ?? null
        }
      ];
    });
  }, [landmarks, sortedResults, targetCoordinates]);

  const onExportCsv = () => {
    const lines: string[][] = [
      ["Landmark", "To Landmark Duration (min)", "To Landmark Distance (km)", "To Target Duration (min)", "To Target Distance (km)", "Errors"]
    ];

    for (const row of sortedResults) {
      lines.push([
        row.landmark,
        row.to_landmark?.duration_minutes?.toString() ?? "",
        row.to_landmark?.distance_km?.toString() ?? "",
        row.to_target?.duration_minutes?.toString() ?? "",
        row.to_target?.distance_km?.toString() ?? "",
        row.error ?? ""
      ]);
    }

    const csv = `${lines.map((line) => line.map(toCsvValue).join(",")).join("\n")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "travel-matrix-results.csv";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  };

  return (
    <main className="page-shell">
      <section className="panel panel-main">
        <div className="heading-row">
          <div>
            <h1>Travel Time Matrix</h1>
            <p className="panel-subtitle">Calculate live travel time between one target and your fixed landmark set.</p>
          </div>
          <span className="badge-soft">{landmarks.length} landmarks</span>
        </div>

        <form className="target-form" onSubmit={onCalculateSubmit}>
          <label htmlFor="target-link">Paste Google Maps link</label>
          <input
            id="target-link"
            type="url"
            placeholder="https://www.google.com/maps/..."
            value={targetInput}
            onChange={(event) => setTargetInput(event.target.value)}
            required
          />

          <div className="toolbar-row">
            <label htmlFor="travel-mode">Mode</label>
            <select
              id="travel-mode"
              value={travelMode}
              onChange={(event) => setTravelMode(event.target.value as TravelMode)}
            >
              <option value="driving">Driving</option>
              <option value="walking">Walking</option>
              <option value="transit">Transit</option>
            </select>

            <button type="submit" disabled={calculateLoading}>
              {calculateLoading ? "Calculating..." : "Calculate"}
            </button>

            <button type="button" onClick={onExportCsv} disabled={sortedResults.length === 0} className="secondary">
              Export CSV
            </button>
          </div>

          <div className="toolbar-row muted-controls">
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(event) => setAutoRefreshEnabled(event.target.checked)}
              />
              Auto-refresh every 5 minutes
            </label>

            <label htmlFor="sort-results">Sort results</label>
            <select id="sort-results" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
              <option value="none">Default order</option>
              <option value="to_landmark">Shortest -&gt; To Landmark</option>
              <option value="to_target">Shortest &lt;- To Target</option>
            </select>
          </div>
        </form>

        {calculateLoading ? (
          <div className="loading-state">
            <div className="spinner" aria-hidden="true" />
            <span>Fetching live travel times...</span>
          </div>
        ) : null}

        {calculateError ? <p className="error-banner">{calculateError}</p> : null}

        {targetCoordinates ? (
          <p className="meta-row">
            Target coordinates: {targetCoordinates.lat.toFixed(5)}, {targetCoordinates.lng.toFixed(5)}
          </p>
        ) : null}

        {generatedAt ? <p className="meta-row">Last updated: {new Date(generatedAt).toLocaleString()}</p> : null}
      </section>

      <section className="panel panel-subtle">
        <details className="landmarks-details">
          <summary>Landmark editor (optional)</summary>

          <form className="landmark-add" onSubmit={onNewLandmarkSubmit}>
            <input
              type="text"
              placeholder="Landmark name"
              value={newLandmark.name}
              onChange={(event) => setNewLandmark((previous) => ({ ...previous, name: event.target.value }))}
              required
            />
            <input
              type="url"
              placeholder="Google Maps URL"
              value={newLandmark.maps_url}
              onChange={(event) => setNewLandmark((previous) => ({ ...previous, maps_url: event.target.value }))}
              required
            />
            <button type="submit" disabled={landmarkBusyKey === "add"}>
              {landmarkBusyKey === "add" ? "Adding..." : "Add"}
            </button>
          </form>

          {landmarksLoading ? <p>Loading landmarks...</p> : null}
          {landmarksError ? <p className="error-banner">{landmarksError}</p> : null}
          {landmarkActionError ? <p className="error-banner">{landmarkActionError}</p> : null}

          {!landmarksLoading && landmarks.length === 0 ? <p>No landmarks yet. Add one above.</p> : null}

          {landmarks.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Maps URL</th>
                    <th>Coordinates</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {landmarks.map((landmark) => {
                    const isSaving = landmarkBusyKey === `save:${landmark.id}`;
                    const isDeleting = landmarkBusyKey === `delete:${landmark.id}`;

                    return (
                      <tr key={landmark.id}>
                        <td>
                          <input
                            type="text"
                            value={landmark.name}
                            onChange={(event) => onLandmarkFieldChange(landmark.id, "name", event.target.value)}
                            aria-label={`Name for ${landmark.name}`}
                          />
                        </td>
                        <td>
                          <input
                            type="url"
                            value={landmark.maps_url}
                            onChange={(event) => onLandmarkFieldChange(landmark.id, "maps_url", event.target.value)}
                            aria-label={`Maps URL for ${landmark.name}`}
                          />
                        </td>
                        <td>
                          {landmark.lat.toFixed(5)}, {landmark.lng.toFixed(5)}
                        </td>
                        <td className="row-actions">
                          <button type="button" onClick={() => void onSaveLandmark(landmark)} disabled={isSaving || isDeleting}>
                            {isSaving ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => void onDeleteLandmark(landmark.id)}
                            disabled={isSaving || isDeleting}
                          >
                            {isDeleting ? "Deleting..." : "Delete"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </details>
      </section>

      <div className="content-grid">
        <section className="panel">
          <h2>Results</h2>

          {sortedResults.length === 0 ? (
            <p>Run a calculation to view travel times.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Landmark</th>
                    <th>-&gt; To Landmark</th>
                    <th>&lt;- To Target</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((row) => {
                    const toLandmarkDuration = row.to_landmark?.duration_minutes;
                    const toTargetDuration = row.to_target?.duration_minutes;

                    const toLandmarkIsShorter =
                      typeof toLandmarkDuration === "number" &&
                      typeof toTargetDuration === "number" &&
                      toLandmarkDuration < toTargetDuration;

                    const toTargetIsShorter =
                      typeof toLandmarkDuration === "number" &&
                      typeof toTargetDuration === "number" &&
                      toTargetDuration < toLandmarkDuration;

                    return (
                      <tr key={row.landmarkId}>
                        <td>
                          <strong>{row.landmark}</strong>
                          {row.error ? <div className="row-error">{row.error}</div> : null}
                        </td>
                        <td className={toLandmarkIsShorter ? "metric-cell faster" : "metric-cell"}>
                          {formatDuration(row.to_landmark?.duration_minutes)} ({formatDistance(row.to_landmark?.distance_km)})
                        </td>
                        <td className={toTargetIsShorter ? "metric-cell faster" : "metric-cell"}>
                          {formatDuration(row.to_target?.duration_minutes)} ({formatDistance(row.to_target?.distance_km)})
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Live Map</h2>
          {!targetCoordinates || mapPoints.length === 0 ? (
            <p>Run a calculation to render the target and landmarks on the map.</p>
          ) : (
            <>
              <TravelMap target={targetCoordinates} points={mapPoints} />

              <div className="map-legend">
                <div className="legend-row legend-target">
                  <span className="legend-badge target">T</span>
                  <span className="legend-name">Target location</span>
                </div>
                {mapPoints.map((item) => (
                  <div className="legend-row" key={item.id}>
                    <span className="legend-badge">{item.label}</span>
                    <span className="legend-name">{item.name}</span>
                    <span className="legend-metrics">
                      to landmark: {formatDuration(item.toLandmarkMinutes)} | to target: {formatDuration(item.toTargetMinutes)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
