/** Routes of the intake (screens.md "Согласие на анкету", "Анкета клиента", "Карточка пары: ↳ Анкета"). */
export const clientPairPath = (coachingId: string) => `/client/trainers/${coachingId}`;
export const clientIntakePath = (coachingId: string) => `/client/trainers/${coachingId}/intake`;
export const intakeConsentPath = (coachingId: string) => `/client/trainers/${coachingId}/intake-consent`;
export const trainerIntakePath = (coachingId: string) => `/trainer/clients/${coachingId}/intake`;
