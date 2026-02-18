# Travel Time Matrix MVP (Next.js)

Minimal, production-oriented MVP that calculates distance and real-time travel duration (traffic-aware) between:
- a user-provided target Google Maps link
- an editable list of landmark points

Both directions are computed for every landmark:
1. `target -> landmark`
2. `landmark -> target`

## Stack

- Next.js 14 (App Router) + React + TypeScript
- Next.js API routes for backend
- Google Maps Platform APIs:
  - Geocoding API
  - Distance Matrix API

## Features

- Parse coordinates directly from Google Maps links containing `@lat,lng`
- Automatically expand Google Maps short/share links (`maps.app.goo.gl`) before parsing
- Fallback geocoding for place/share links without coordinates
- Editable landmarks stored in `data/landmarks.json`
- Landmark CRUD UI (add, edit, delete)
- Two-way distance + duration calculations for each landmark
- Uses `duration_in_traffic` when available, fallback to `duration`
- Sort results by shortest `-> To Landmark` or `<- To Target`
- Optional auto-refresh every 5 minutes
- CSV export
- In-page interactive map visualization (OpenStreetMap + markers + connection lines)
- Loading and clear error states
- Basic in-memory rate limiting + TTL caching

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy environment template:

```bash
cp .env.example .env.local
```

3. Add your API key in `.env.local`:

```env
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

4. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Google API Setup

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create/select a project.
3. Enable these APIs:
   - Geocoding API
   - Distance Matrix API
4. Create an API key.
5. Restrict the key:
   - API restrictions: allow only Geocoding API and Distance Matrix API.
   - Application restriction:
     - For local/server environments, use IP-based restrictions where possible.
     - For Vercel/serverless, use key restrictions compatible with your backend egress setup.
6. Put the key in `.env.local` as `GOOGLE_MAPS_API_KEY`.

## Usage

1. Paste a target Google Maps link into **Paste Google Maps link**.
2. Select travel mode (driving/walking/transit).
3. Click **Calculate**.
4. Manage landmarks in the **Landmarks** section.
5. View two-way durations and distances in **Results**.
6. Optionally enable auto-refresh and export CSV.

## Landmark Storage

Landmarks are stored in:

- `data/landmarks.json`

Seed landmarks are included by default.

Schema:

```json
{
  "id": "string",
  "name": "string",
  "maps_url": "string",
  "lat": 0,
  "lng": 0
}
```

When adding/updating landmarks, `lat/lng` are automatically extracted/geocoded from `maps_url`.

## API Endpoints

- `GET /api/landmarks` - list landmarks
- `POST /api/landmarks` - add landmark
- `PUT /api/landmarks/:id` - update landmark
- `DELETE /api/landmarks/:id` - delete landmark
- `POST /api/travel` - compute bidirectional matrix for all landmarks

### Travel request body

```json
{
  "targetInput": "https://www.google.com/maps/...",
  "mode": "driving"
}
```

## Production Notes

- API keys are server-side only (`GOOGLE_MAPS_API_KEY`).
- Landmark file storage is suitable for MVP/local usage.
- For production on serverless platforms, move landmark storage to a persistent database (e.g., Postgres, Firestore).
- In-memory cache/rate limiting reset on process restart and across serverless instances.

## Deployment (Vercel)

1. Push repository to Git provider.
2. Import project in Vercel.
3. Set environment variable:
   - `GOOGLE_MAPS_API_KEY`
4. Deploy.

If you need persistent landmark editing in production, replace JSON file storage with a database-backed store.
