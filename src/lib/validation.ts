import { z } from "zod";

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const coordinateSchema = z.number().refine((value) => Number.isFinite(value), {
  message: "Invalid coordinate value"
});

export const landmarkInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
    maps_url: z
      .string()
      .trim()
      .min(1, "Maps URL is required")
      .max(1000, "Maps URL is too long")
      .refine((value) => isValidUrl(value), "Maps URL must be a valid http(s) URL"),
    lat: coordinateSchema.optional(),
    lng: coordinateSchema.optional()
  })
  .refine((value) => (value.lat === undefined && value.lng === undefined) || (value.lat !== undefined && value.lng !== undefined), {
    message: "lat and lng must both be provided if one is set"
  })
  .refine((value) => value.lat === undefined || (value.lat >= -90 && value.lat <= 90), {
    message: "lat must be between -90 and 90"
  })
  .refine((value) => value.lng === undefined || (value.lng >= -180 && value.lng <= 180), {
    message: "lng must be between -180 and 180"
  });

export const landmarkUpdateSchema = landmarkInputSchema;

export const travelRequestSchema = z.object({
  targetInput: z.string().trim().min(1, "Target location link is required").max(2000),
  mode: z.enum(["driving", "walking", "transit"]).default("driving")
});
