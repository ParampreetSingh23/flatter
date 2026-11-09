import type { PublishedFlat } from "./dashboard-types";
import type { Intent } from "./onboarding-types";

export interface DiscoveryCard {
  publicId: string; displayName: string | null; avatarUrl: string | null; age: number | null; occupation: string | null; bio: string | null;
  intent: Intent; city: { id: string; label: string | null } | null;
  flat?: { locality: string | null; rentPaise: number; availableFrom: string | null; availableFlexible: boolean; coverUrl: string | null };
  seeking?: {
    localities: (string | null)[]; localitiesFlexible: boolean; rentMinPaise: number | null; rentMaxPaise: number | null;
    moveInFlexible: boolean; moveInEarliest: string | null; moveInLatest: string | null;
  };
  compatibility: { score: number; policy: string };
  versions: { profile: number; listing: number | null };
}
export interface DiscoveryRes { policy: string; poolSize: number; cards: DiscoveryCard[]; empty: "FILTERS" | "EXHAUSTED" | null }
export interface DiscoveryDetail extends Omit<DiscoveryCard, "flat"> {
  lifestyle: {
    sleepSchedule: string; cleanliness: string; foodHabit: string; smokingHabit: string; guestFrequency: string; bringingPet: boolean; workStudySchedule: string;
  };
  flat: PublishedFlat | null;
}
export interface ActionRes { kind: "LIKE" | "PASS"; matched: boolean; matchId?: string }
export interface MatchItem {
  id: string; matchedAt: string;
  person: { publicId: string; displayName: string | null; avatarUrl: string | null; intent: Intent; age: number | null };
  chat: { available: boolean; reason: string };
}
export const REPORT_REASONS = [
  { value: "HARASSMENT", label: "Harassment" }, { value: "SCAM", label: "Scam" }, { value: "FAKE_PROFILE", label: "Fake profile or listing" },
  { value: "INAPPROPRIATE_CONTENT", label: "Inappropriate content" }, { value: "OTHER", label: "Something else" },
] as const;
