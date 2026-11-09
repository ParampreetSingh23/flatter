import { z } from "zod";
import { catalogue, CITY_IDS, LOCALITY_CITY } from "./cities.js";
import { Furnishing, PhotoCategory, RoomType } from "./generated/prisma/client.js";
import { dateStr } from "./onboarding-rules.js";

export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 10;
const int32 = z.int().max(2147483647);

// Field names = DB columns (permissionConfirmed maps to permissionConfirmedAt).
export const detailsShape = {
  title: z.string().trim().min(10).max(100),
  description: z.string().trim().min(30).max(2000),
  cityId: z.enum(CITY_IDS),
  localityId: z.string().refine((id) => LOCALITY_CITY.has(id), "Choose a supported locality"),
  bedrooms: z.int().min(1).max(10),
  availablePlaces: z.int().min(1).max(10),
  roomType: z.enum(RoomType),
  furnishing: z.enum(Furnishing),
  monthlyRentPaise: int32.min(1),
  depositPaise: int32.min(0),
  chargesNote: z.string().trim().min(1).max(500),
  availableFrom: dateStr.nullable(),
  availableFlexible: z.boolean(),
  permissionConfirmed: z.boolean(),
};
export const patchBody = z.strictObject(detailsShape).partial().extend({ version: z.int().min(0) });

export const photosBody = z.strictObject({
  version: z.int().min(0),
  photos: z.array(z.strictObject({ id: z.uuid(), category: z.enum(PhotoCategory) })).max(MAX_PHOTOS),
  coverPhotoId: z.uuid().nullable(),
});

export const uploadBody = z.strictObject({
  version: z.int().min(0),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  bytes: z.int().min(1).max(5 * 1024 * 1024),
  category: z.enum(PhotoCategory),
  filename: z.string().max(200).optional(),
});
export const versionBody = z.strictObject({ version: z.int().min(0) });

export const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface ListingRow {
  title: string | null; description: string | null; cityId: string | null; localityId: string | null;
  bedrooms: number | null; availablePlaces: number | null; roomType: string | null; furnishing: string | null;
  monthlyRentPaise: number | null; depositPaise: number | null; chargesNote: string | null;
  availableFrom: Date | null; availableFlexible: boolean | null; permissionConfirmedAt: Date | null; coverPhotoId: string | null;
}
export interface ReadyPhoto { id: string; category: string }
export type Missing = { field: string; message: string };

// Derived on every read; never stored as truth.
export function missingItems(l: ListingRow, ready: ReadyPhoto[], today: string): Missing[] {
  const m: Missing[] = [];
  const need = (ok: boolean, field: string, message: string) => { if (!ok) m.push({ field, message }); };
  need(!!l.title && l.title.length >= 10, "title", "Add a title (10–100 characters).");
  need(!!l.description && l.description.length >= 30, "description", "Add a description (30–2,000 characters).");
  need(!!l.cityId, "cityId", "Choose a city.");
  need(!!l.localityId && LOCALITY_CITY.get(l.localityId) === l.cityId, "localityId", "Choose your flat's locality.");
  need(l.bedrooms !== null, "bedrooms", "Enter the number of bedrooms.");
  need(l.availablePlaces !== null, "availablePlaces", "Enter how many people can move in.");
  need(l.roomType !== null, "roomType", "Choose private or shared room.");
  need(l.furnishing !== null, "furnishing", "Choose the furnishing.");
  need(l.monthlyRentPaise !== null, "monthlyRentPaise", "Enter the monthly rent per person.");
  need(l.depositPaise !== null, "depositPaise", "Enter the refundable deposit (0 is fine).");
  need(!!l.chargesNote, "chargesNote", 'Explain utilities and other charges ("Included in rent" is fine).');
  need(
    l.availableFlexible === true || (l.availableFlexible === false && !!l.availableFrom && iso(l.availableFrom) >= today),
    "availableFrom", "Choose an available-from date (today or later) or Flexible.",
  );
  need(ready.length >= MIN_PHOTOS && ready.length <= MAX_PHOTOS, "photos", `Add ${MIN_PHOTOS}–${MAX_PHOTOS} ready photos (you have ${ready.length}).`);
  need(ready.some((p) => p.category === "ROOM"), "photoRoom", "Add at least one room photo.");
  need(ready.some((p) => p.category === "SHARED_SPACE"), "photoShared", "Add at least one shared-space photo.");
  need(!!l.coverPhotoId && ready.some((p) => p.id === l.coverPhotoId), "coverPhotoId", "Choose a cover photo.");
  need(!!l.permissionConfirmedAt, "permissionConfirmed", "Confirm you have permission to advertise this space and its photos.");
  return m;
}

export const cityLabel = (id: string | null) => catalogue.cities.find((c) => c.id === id)?.label ?? null;
export const localityLabel = (id: string | null) =>
  catalogue.cities.flatMap((c) => c.localities).find((l) => l.id === id)?.label ?? null;
