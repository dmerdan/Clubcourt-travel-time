"use client";

import { Fragment } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip } from "react-leaflet";
import { Coordinates } from "@/lib/types";

export interface TravelMapPoint {
  id: string;
  label: string;
  name: string;
  lat: number;
  lng: number;
  toLandmarkMinutes: number | null;
  toTargetMinutes: number | null;
}

interface TravelMapProps {
  target: Coordinates;
  points: TravelMapPoint[];
}

function formatDuration(value: number | null): string {
  if (typeof value !== "number") {
    return "-";
  }

  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(1);
  return `${rounded} min`;
}

export default function TravelMap({ target, points }: TravelMapProps) {
  const targetPosition: [number, number] = [target.lat, target.lng];

  return (
    <div className="live-map-shell">
      <MapContainer center={targetPosition} zoom={11} scrollWheelZoom className="live-map" preferCanvas>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        <CircleMarker center={targetPosition} radius={11} pathOptions={{ color: "#e05544", fillColor: "#e05544", fillOpacity: 0.95 }}>
          <Tooltip permanent direction="top" offset={[0, -10]} className="map-tooltip target">
            T
          </Tooltip>
          <Popup>
            <strong>Target location</strong>
            <div>
              {target.lat.toFixed(5)}, {target.lng.toFixed(5)}
            </div>
          </Popup>
        </CircleMarker>

        {points.map((point) => {
          const pointPosition: [number, number] = [point.lat, point.lng];

          return (
            <Fragment key={point.id}>
              <Polyline
                positions={[targetPosition, pointPosition]}
                pathOptions={{ color: "#f0f0f0", weight: 3, opacity: 0.55 }}
              />
              <CircleMarker center={pointPosition} radius={9} pathOptions={{ color: "#f0f0f0", fillColor: "#f0f0f0", fillOpacity: 0.92 }}>
                <Tooltip permanent direction="top" offset={[0, -10]} className="map-tooltip">
                  {point.label}
                </Tooltip>
                <Popup>
                  <strong>{point.name}</strong>
                  <div>
                    {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                  </div>
                  <div>to landmark: {formatDuration(point.toLandmarkMinutes)}</div>
                  <div>to target: {formatDuration(point.toTargetMinutes)}</div>
                </Popup>
              </CircleMarker>
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
