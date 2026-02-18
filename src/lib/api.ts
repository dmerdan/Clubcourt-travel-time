import { NextRequest, NextResponse } from "next/server";

export function getClientIdentifier(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

export function errorResponse(message: string, status = 400, details?: string) {
  return NextResponse.json(
    {
      error: message,
      details
    },
    { status }
  );
}

export function getGoogleMapsApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured.");
  }

  return key;
}
