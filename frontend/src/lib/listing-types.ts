export type ListingStatus = "DRAFT" | "PUBLISHED" | "PAUSED" | "CLOSED";
export type PhotoCategory = "ROOM" | "SHARED_SPACE" | "OTHER";

export interface ListingPhoto {
  id: string; state: "PENDING" | "PROCESSING" | "READY" | "FAILED"; category: PhotoCategory; sortOrder: number;
  width: number | null; height: number | null; originalName: string | null; isCover: boolean; url: string | null;
}
export interface ListingView {
  id: string; status: ListingStatus; version: number; publishedAt: string | null; coverPhotoId: string | null;
  details: {
    title: string | null; description: string | null; cityId: string | null; localityId: string | null; bedrooms: number | null;
    availablePlaces: number | null; roomType: string | null; furnishing: string | null; monthlyRentPaise: number | null;
    depositPaise: number | null; chargesNote: string | null; availableFrom: string | null; availableFlexible: boolean | null; permissionConfirmed: boolean;
  };
  photos: ListingPhoto[];
  checklist: { canPublish: boolean; missing: { field: string; message: string }[] };
}
export interface Mine { listing: ListingView | null; canCreate: boolean }

export const CATEGORIES: { value: PhotoCategory; label: string }[] = [
  { value: "ROOM", label: "Room" }, { value: "SHARED_SPACE", label: "Shared space" }, { value: "OTHER", label: "Other" },
];
export const ROOM_TYPES = [{ value: "PRIVATE", label: "Private room" }, { value: "SHARED", label: "Shared room" }];
export const FURNISHING = [
  { value: "UNFURNISHED", label: "Unfurnished" }, { value: "SEMI_FURNISHED", label: "Semi-furnished" }, { value: "FURNISHED", label: "Furnished" },
];
export const STATUS_LABEL: Record<ListingStatus, string> = { DRAFT: "Draft", PUBLISHED: "Published", PAUSED: "Paused", CLOSED: "Closed" };

// Which editor block fixes a checklist item.
export const BLOCK_OF: Record<string, "flat" | "rent" | "photos" | "review"> = {
  title: "flat", description: "flat", cityId: "flat", localityId: "flat", bedrooms: "flat", availablePlaces: "flat", roomType: "flat", furnishing: "flat",
  monthlyRentPaise: "rent", depositPaise: "rent", chargesNote: "rent", availableFrom: "rent",
  photos: "photos", photoRoom: "photos", photoShared: "photos", coverPhotoId: "photos", permissionConfirmed: "review",
};
