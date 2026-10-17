import { z } from "zod";
import { parseMajor } from "@/lib/money/format";
import { APPLIES_TO, VALIDITY_DAYS } from "@/lib/packages/grid";
import { isDay, PAYMENT_METHODS } from "./present";

/** Limits of the database checks: reasons and notes on passes, freezes and payments. */
export const REASON_MAX_LENGTH = 500;

const uuid = z.uuid();
const day = z.string().refine(isDay);
const reason = z.string().trim().min(1).max(REASON_MAX_LENGTH);
const optionalText = z
  .string()
  .trim()
  .max(REASON_MAX_LENGTH)
  .transform((value) => value || null);

/** A typed amount in major units ("18 000") as minor units, above zero. */
export const amount = z
  .string()
  .transform((value) => parseMajor(value))
  .refine((value) => value !== null && value > 0)
  .transform((value) => value as number);

const price = z
  .string()
  .transform((value) => parseMajor(value))
  .refine((value) => value !== null)
  .transform((value) => value as number);

/** A payment that comes with the sale or is entered on its own: amount, method and day. */
export const paymentInput = z.object({
  amount,
  method: z.enum(PAYMENT_METHODS),
  paidOn: day,
});

/** "Оформить абонемент": from a live package, or custom terms in the trainer's currency (PRD 2.8-4). */
export const sellInput = z.object({
  coachingId: uuid,
  startsOn: day,
  note: optionalText,
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("package"), packageId: uuid }),
    z.object({
      kind: z.literal("custom"),
      title: z.string().trim().min(1).max(120),
      sessions: z.coerce.number().int().min(1).max(200),
      price,
      validity: z
        .string()
        .transform((value) => (value ? Number(value) : null))
        .refine((value) => value === null || (VALIDITY_DAYS as readonly number[]).includes(value)),
      appliesTo: z.enum(APPLIES_TO),
    }),
  ]),
  payment: paymentInput.nullable(),
});
export type SellInput = z.input<typeof sellInput>;

export const cancelInput = z.object({ passId: uuid, reason });
export type CancelInput = z.input<typeof cancelInput>;

/** "Изменить срок": a new last day, or none, always with a reason (PRD 2.8-8). */
export const expiryInput = z.object({ passId: uuid, lastDay: day.nullable(), reason });
export type ExpiryInput = z.input<typeof expiryInput>;

/** "Заморозить": first and last day, inclusive, in the trainer time zone (PRD 2.8-14). */
export const freezeInput = z
  .object({ passId: uuid, from: day, to: day, reason: optionalText })
  .refine((value) => value.to >= value.from, { path: ["to"] });
export type FreezeInput = z.input<typeof freezeInput>;

export const endFreezeInput = z.object({ freezeId: uuid, lastDay: day });
export type EndFreezeInput = z.input<typeof endFreezeInput>;

/** "Отметить оплату" by the trainer: for a pass or on account, money in or a refund. */
export const recordInput = z.object({
  coachingId: uuid,
  passId: uuid.nullable(),
  direction: z.enum(["in", "refund"]),
  payment: paymentInput,
  note: optionalText,
});
export type RecordInput = z.input<typeof recordInput>;

/** "Я оплатил" by the client: only tells the trainer, the balance waits for the confirmation. */
export const reportInput = z.object({ passId: uuid, payment: paymentInput, note: optionalText });
export type ReportInput = z.input<typeof reportInput>;

export const voidInput = z.object({ paymentId: uuid, reason });
export type VoidInput = z.input<typeof voidInput>;

/** "Исправить": the new amount, method and day of a confirmed payment, and what was wrong (PRD 2.8-13). */
export const correctInput = z.object({ paymentId: uuid, payment: paymentInput, reason });
export type CorrectInput = z.input<typeof correctInput>;

/** "Простить": one charge, with an optional reason (PRD 2.6.6-4). */
export const waiveInput = z.object({ chargeId: uuid, reason: optionalText });
export type WaiveInput = z.input<typeof waiveInput>;

/** "Корректировка": plus or minus some sessions on a pass, with a note (R84). */
export const adjustInput = z.object({
  passId: uuid,
  delta: z.number().int().min(-200).max(200).refine((value) => value !== 0),
  note: reason,
});
export type AdjustInput = z.input<typeof adjustInput>;

/** "Дозаписать занятие": a personal session that already took place, at a local day and time (PRD 2.6.2-7). */
export const pastSessionInput = z.object({
  coachingId: uuid,
  day,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMin: z.number().int().min(15).max(480),
  status: z.enum(["attended", "no_show"]),
});
export type PastSessionInput = z.input<typeof pastSessionInput>;

/** Field names of a failed parse, for the form to mark. */
export function invalidFields(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.map(String).join(".")))];
}
