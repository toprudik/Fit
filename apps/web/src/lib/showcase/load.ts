import type { Database, Json } from "@/lib/supabase/database.types";

type ShowcaseRow = Database["public"]["Functions"]["get_trainer_showcase"]["Returns"][number];

export type ShowcaseLocation = { name: string; address: string | null };

export type Showcase = {
  slug: string;
  name: string | null;
  photoUrl: string | null;
  headline: string | null;
  bio: string | null;
  specialties: string[];
  city: string | null;
  worksOffline: boolean;
  worksOnline: boolean;
  verified: boolean;
  locations: ShowcaseLocation[];
  isOwn: boolean;
  coachingId: string | null;
};

function locationsFrom(value: Json | null): ShowcaseLocation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.name !== "string") return [];
    return [{ name: item.name, address: typeof item.address === "string" && item.address.trim() ? item.address : null }];
  });
}

/**
 * The showcase get_trainer_showcase answered, or null when it is unavailable. The generated types call
 * every column non-null; an unavailable row has them all null, so each one is checked here.
 */
export function showcaseFrom(row: ShowcaseRow | undefined): Showcase | null {
  if (!row || row.status !== "available" || !row.slug) return null;
  return {
    slug: row.slug,
    name: row.name ?? null,
    photoUrl: row.photo_url ?? null,
    headline: row.headline ?? null,
    bio: row.bio ?? null,
    specialties: row.specialties ?? [],
    city: row.city ?? null,
    worksOffline: row.works_offline === true,
    worksOnline: row.works_online === true,
    verified: row.verified === true,
    locations: locationsFrom(row.locations ?? null),
    isOwn: row.is_own === true,
    coachingId: row.coaching_id ?? null,
  };
}
