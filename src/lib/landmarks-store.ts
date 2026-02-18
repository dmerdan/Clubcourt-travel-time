import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Landmark } from "@/lib/types";

const DATA_FILE_PATH = path.join(process.cwd(), "data", "landmarks.json");
let writeQueue: Promise<void> = Promise.resolve();

const storedLandmarkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  maps_url: z.string().min(1),
  lat: z.number(),
  lng: z.number()
});

const storedLandmarksSchema = z.array(storedLandmarkSchema);

async function ensureDataFileExists(): Promise<void> {
  try {
    await fs.access(DATA_FILE_PATH);
  } catch {
    await fs.mkdir(path.dirname(DATA_FILE_PATH), { recursive: true });
    await fs.writeFile(DATA_FILE_PATH, "[]", "utf8");
  }
}

export async function readLandmarks(): Promise<Landmark[]> {
  await ensureDataFileExists();

  const raw = await fs.readFile(DATA_FILE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return storedLandmarksSchema.parse(parsed);
}

export async function writeLandmarks(landmarks: Landmark[]): Promise<void> {
  const validated = storedLandmarksSchema.parse(landmarks);

  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      await ensureDataFileExists();
      await fs.writeFile(DATA_FILE_PATH, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
    });

  await writeQueue;
}

export async function addLandmark(landmark: Omit<Landmark, "id">): Promise<Landmark> {
  const allLandmarks = await readLandmarks();

  const newLandmark: Landmark = {
    id: randomUUID(),
    ...landmark
  };

  allLandmarks.push(newLandmark);
  await writeLandmarks(allLandmarks);

  return newLandmark;
}

export async function updateLandmark(id: string, landmark: Omit<Landmark, "id">): Promise<Landmark | null> {
  const allLandmarks = await readLandmarks();
  const index = allLandmarks.findIndex((item) => item.id === id);

  if (index === -1) {
    return null;
  }

  const updated: Landmark = {
    id,
    ...landmark
  };

  allLandmarks[index] = updated;
  await writeLandmarks(allLandmarks);

  return updated;
}

export async function deleteLandmark(id: string): Promise<boolean> {
  const allLandmarks = await readLandmarks();
  const filtered = allLandmarks.filter((item) => item.id !== id);

  if (filtered.length === allLandmarks.length) {
    return false;
  }

  await writeLandmarks(filtered);
  return true;
}
