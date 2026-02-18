import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { errorResponse, getClientIdentifier } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { addLandmark, readLandmarks } from "@/lib/landmarks-store";
import { resolveCoordinatesFromInput } from "@/lib/google-maps";
import { checkRateLimit } from "@/lib/rate-limit";
import { landmarkInputSchema } from "@/lib/validation";

const LANDMARKS_WINDOW_MS = 15 * 60 * 1000;
const LANDMARKS_MAX_REQUESTS = 120;

export async function GET(request: NextRequest) {
  const clientKey = `landmarks:get:${getClientIdentifier(request)}`;
  if (!checkRateLimit(clientKey, LANDMARKS_MAX_REQUESTS, LANDMARKS_WINDOW_MS)) {
    return errorResponse("Rate limit exceeded. Please try again in a few minutes.", 429);
  }

  try {
    const landmarks = await readLandmarks();
    return NextResponse.json({ landmarks });
  } catch (error) {
    return errorResponse("Failed to read landmarks.", 500, getErrorMessage(error));
  }
}

export async function POST(request: NextRequest) {
  const clientKey = `landmarks:post:${getClientIdentifier(request)}`;
  if (!checkRateLimit(clientKey, LANDMARKS_MAX_REQUESTS, LANDMARKS_WINDOW_MS)) {
    return errorResponse("Rate limit exceeded. Please try again in a few minutes.", 429);
  }

  try {
    const body = await request.json();
    const input = landmarkInputSchema.parse(body);

    const coords =
      input.lat !== undefined && input.lng !== undefined
        ? { lat: input.lat, lng: input.lng }
        : await resolveCoordinatesFromInput(input.maps_url);

    if (!coords) {
      return errorResponse("Could not resolve coordinates from this link.", 400);
    }

    const landmark = await addLandmark({
      name: input.name,
      maps_url: input.maps_url,
      lat: coords.lat,
      lng: coords.lng
    });

    return NextResponse.json({ landmark }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse("Invalid landmark payload.", 400, error.issues.map((issue) => issue.message).join("; "));
    }

    return errorResponse("Failed to add landmark.", 500, getErrorMessage(error));
  }
}
