import { z } from "zod";
import { LOCALES } from "@/i18n/config";
import { ZONES } from "@/lib/navigation/zones";
import { DATA_REQUEST_TYPES, FEEDBACK_KINDS, MAX_FEEDBACK_LENGTH, MAX_SCREENSHOTS, type FeedbackInput } from "./input";

/**
 * The server's check of a feedback message (PRD wave-1 §2.13-2). Kept out of ./input so zod stays out of the browser.
 * A data request names what it asks for and carries no screenshots; other messages have no request type.
 */
export const feedbackInput = z
  .object({
    id: z.uuid(),
    kind: z.enum(FEEDBACK_KINDS),
    requestType: z.enum(DATA_REQUEST_TYPES).nullable(),
    body: z.string().trim().min(1).max(MAX_FEEDBACK_LENGTH),
    route: z.string().max(200).nullable(),
    zone: z.enum(ZONES).nullable(),
    platform: z.string().max(32).nullable(),
    locale: z.enum(LOCALES),
    theme: z.enum(["light", "dark"]).nullable(),
    screenshots: z.array(z.string()).max(MAX_SCREENSHOTS),
  })
  .refine((input) =>
    input.kind === "data_request" ? input.requestType !== null && input.screenshots.length === 0 : input.requestType === null,
  ) satisfies z.ZodType<FeedbackInput>;
