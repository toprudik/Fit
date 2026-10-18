import type { Zone } from "@/lib/navigation/zones";

/** Path of the zone's help screen; links never carry the locale (ADR 0015). */
export const helpPath = (zone: Zone) => `/${zone}/help` as const;
