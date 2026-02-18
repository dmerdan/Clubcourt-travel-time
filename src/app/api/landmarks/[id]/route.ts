import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { errorResponse, getClientIdentifier } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { deleteLandmark, updateLandmark } from "@/lib/landmarks-store";
import { resolveCoordinatesFromInput } from "@/lib/google-maps";
import { checkRateLimit } from "@/lib/rate-limit";
import { landmarkUpdateSchema } from "@/lib/validation";

const LANDMARKS_WINDOW_MS = 15 * 60 * 1000;
const LANDMARKS_MAX_REQUESTS = 120;

export async function PUT(request: NextRequest, context: { params: { id: string } }) {
  const clientKey = `landmarks:put:${getClientIdentifier(request)}`;
  if (!checkRateLimit(clientKey, LANDMARKS_MAX_REQUESTS, LANDMARKS_WINDOW_MS)) {
    return errorResponse("Rate limit exceeded. Please try again in a few minutes.", 429);
  }

  try {
    const body = await request.json();
    const input = landmarkUpdateSchema.parse(body);

    const coords =
      input.lat !== undefined && input.lng !== undefined
        ? { lat: input.lat, lng: input.lng }
        : await resolveCoordinatesFromInput(input.maps_url);

    if (!coords) {
      return errorResponse("Could not resolve coordinates from this link.", 400);
    }

    const updated = await updateLandmark(context.params.id, {
      name: input.name,
      maps_url: input.maps_url,
      lat: coords.lat,
      lng: coords.lng
    });

    if (!updated) {
      return errorResponse("Landmark not found.", 404);
    }

    return NextResponse.json({ landmark: updated });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse("Invalid landmark payload.", 400, error.issues.map((issue) => issue.message).join("; "));
    }

    return errorResponse("Failed to update landmark.", 500, getErrorMessage(error));
  }
}

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  const clientKey = `landmarks:delete:${getClientIdentifier(request)}`;
  if (!checkRateLimit(clientKey, LANDMARKS_MAX_REQUESTS, LANDMARKS_WINDOW_MS)) {
    return errorResponse("Rate limit exceeded. Please try again in a few minutes.", 429);
  }

  try {
    const deleted = await deleteLandmark(context.params.id);

    if (!deleted) {
      return errorResponse("Landmark not found.", 404);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse("Failed to delete landmark.", 500, getErrorMessage(error));
  }
}
