import type { Intent } from "./onboarding-types";
import type { ListingStatus } from "./listing-types";

export interface HousingSummary {
  city: { id: string; label: string | null } | null;
  localities: { id: string; label: string | null }[];
  locationsFlexible: boolean | null;
  rentMinPaise: number | null; rentMaxPaise: number | null;
  moveInDate: string | null; moveInLatestDate?: string | null; moveInFlexible: boolean | null;
}
export interface ListingSummary {
  id: string; status: ListingStatus; title: string | null; monthlyRentPaise: number | null; locality: string | null; city: string | null;
  photoCount: number; missing: { field: string; message: string }[]; coverUrl: string | null;
  details?: {
    description: string | null; bedrooms: number | null; availablePlaces: number | null; roomType: string | null; furnishing: string | null;
    depositPaise: number | null; chargesNote: string | null; availableFrom: string | null; availableFlexible: boolean | null;
  };
}
export type Availability = "available" | "unavailable";
export interface DashboardData {
  intent: Intent;
  features: Record<"matches" | "messages" | "groups" | "discovery" | "roomSearch" | "listingEditor", Availability>;
  discoveryEnabled: boolean;
  profile: { displayName: string | null; avatarUrl: string | null; publicId: string };
  housing: HousingSummary | null;
  listing: ListingSummary | null;
  listingError: boolean;
  matching: { enrolled: boolean; ready: boolean };
  unreadMessages?: number;
}
export interface MeData {
  version: number; publicId: string; intent: Intent; discoveryEnabled: boolean;
  profile: { displayName: string | null; occupation: string | null; gender: string | null; bio: string | null; avatarUrl: string | null; age: number | null };
  housing: HousingSummary | null;
  lifestyle: {
    sleepSchedule: string | null; cleanliness: string | null; foodHabit: string | null; smokingHabit: string | null;
    bringingPet: boolean | null; guestFrequency: string | null;
  } | null;
  flatmate: {
    acceptedSleepSchedules: string[]; acceptedCleanlinessLevels: string[]; acceptedFoodHabits: string[]; acceptedSmokingHabits: string[];
    flatmatePetPreference: string | null; acceptedGuestFrequencies: string[]; acceptedGenders: string[];
  } | null;
  listing?: ListingSummary | null;
  listingError?: boolean;
  matching: {
    enrolled: boolean; ready: boolean; missing: string[];
    workStudySchedule: string | null; acceptedWorkStudySchedules: string[];
  };
}
export interface PublishedFlat {
  id: string; title: string | null; description: string | null; city: { label: string | null }; locality: { label: string | null };
  bedrooms: number | null; availablePlaces: number | null; roomType: string | null; furnishing: string | null;
  monthlyRentPaise: number | null; depositPaise: number | null; chargesNote: string | null; availableFrom: string | null; availableFlexible: boolean | null;
  coverPhotoId: string | null; photos: { id: string; category: string; url: string | null }[];
}
export interface ViewerData {
  isOwner: boolean; ownerNote?: string;
  profile: { displayName: string | null; avatarUrl: string | null; occupation?: string | null; bio?: string | null; age?: number | null; gender?: string };
  intent?: Intent | null;
  city?: { label: string | null } | null;
  lifestyle?: MeData["lifestyle"];
  flat: PublishedFlat | null;
}

export const INTENT_LABEL: Record<Intent, string> = { HAVE_ROOM: "Need a flatmate", TEAM_UP: "Find a flat together", NEED_ROOM: "Need a room" };
