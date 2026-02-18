import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { errorResponse, getClientIdentifier } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { getDistanceWithTraffic, resolveCoordinatesFromInput } from "@/lib/google-maps";
import { readLandmarks } from "@/lib/landmarks-store";
import { checkRateLimit } from "@/lib/rate-limit";
import { TravelResult } from "@/lib/types";
import { travelRequestSchema } from "@/lib/validation";

const TRAVEL_WINDOW_MS = 15 * 60 * 1000;
const TRAVEL_MAX_REQUESTS = 60;

export async function POST(request: NextRequest) {
  const clientKey = `travel:post:${getClientIdentifier(request)}`;
  if (!checkRateLimit(clientKey, TRAVEL_MAX_REQUESTS, TRAVEL_WINDOW_MS)) {
    return errorResponse("Rate limit exceeded. Please wait a few minutes before recalculating.", 429);
  }

  try {
    const body = await request.json();
    const input = travelRequestSchema.parse(body);

    const targetCoordinates = await resolveCoordinatesFromInput(input.targetInput);
    if (!targetCoordinates) {
      return errorResponse("Could not resolve coordinates from this link.", 400);
    }

    const landmarks = await readLandmarks();
    if (landmarks.length === 0) {
      return errorResponse("No landmarks found. Add at least one landmark first.", 400);
    }

    const results = await Promise.all(
      landmarks.map(async (landmark): Promise<TravelResult> => {
        const [toLandmarkResult, toTargetResult] = await Promise.allSettled([
          getDistanceWithTraffic(targetCoordinates, { lat: landmark.lat, lng: landmark.lng }, input.mode),
          getDistanceWithTraffic({ lat: landmark.lat, lng: landmark.lng }, targetCoordinates, input.mode)
        ]);

        const errors: string[] = [];

        const toLandmark =
          toLandmarkResult.status === "fulfilled"
            ? toLandmarkResult.value
            : (() => {
                errors.push(`target -> landmark failed: ${getErrorMessage(toLandmarkResult.reason)}`);
                return null;
              })();

        const toTarget =
          toTargetResult.status === "fulfilled"
            ? toTargetResult.value
            : (() => {
                errors.push(`landmark -> target failed: ${getErrorMessage(toTargetResult.reason)}`);
                return null;
              })();

        return {
          landmark: landmark.name,
          landmarkId: landmark.id,
          to_landmark: toLandmark,
          to_target: toTarget,
          error: errors.length > 0 ? errors.join(" | ") : undefined
        };
      })
    );

    return NextResponse.json({
      target: targetCoordinates,
      mode: input.mode,
      generatedAt: new Date().toISOString(),
      results
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse("Invalid request payload.", 400, error.issues.map((issue) => issue.message).join("; "));
    }

    return errorResponse("Failed to calculate travel times.", 500, getErrorMessage(error));
  }
}
