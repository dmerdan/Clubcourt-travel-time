export type TravelMode = "driving" | "walking" | "transit";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Landmark {
  id: string;
  name: string;
  maps_url: string;
  lat: number;
  lng: number;
}

export interface DistancePoint {
  distance_km: number;
  duration_minutes: number;
}

export interface TravelResult {
  landmark: string;
  landmarkId: string;
  to_landmark: DistancePoint | null;
  to_target: DistancePoint | null;
  error?: string;
}
