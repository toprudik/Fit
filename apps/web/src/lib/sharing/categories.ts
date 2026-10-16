/**
 * What a client shares with each trainer (PRD wave-1 §2.12-4, decisions Q38). Wave 1 shows these four;
 * nutrition and steps keep their defaults until wave 2 brings their screens.
 */
export const SHARE_CATEGORIES = ["measurements", "photos", "workouts", "intake"] as const;

export type ShareCategory = (typeof SHARE_CATEGORIES)[number];

export type Shares = Record<ShareCategory, boolean>;

export const isShareCategory = (value: unknown): value is ShareCategory => SHARE_CATEGORIES.includes(value as ShareCategory);

/** The client's page of what this trainer sees (screens.md "Доступ к данным"). */
export const sharingPath = (coachingId: string) => `/client/trainers/${coachingId}/sharing`;
