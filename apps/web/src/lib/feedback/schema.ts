import { z } from "zod";
import { LOCALES } from "@/i18n/config";
import { ZONES } from "@/lib/navigation/zones";
import { FEEDBACK_KINDS, MAX_FEEDBACK_LENGTH, MAX_SCREENSHOTS, type FeedbackInput } from "./input";

/** The server's check of a feedback message (PRD wave-1 §2.13-2). Kept out of ./input so zod stays out of the browser. */
export const feedbackInput = z.object({
  id: z.uuid(),
  kind: z.enum(FEEDBACK_KINDS),
  body: z.string().trim().min(1).max(MAX_FEEDBACK_LENGTH),
  route: z.string().max(200).nullable(),
  zone: z.enum(ZONES).nullable(),
  platform: z.string().max(32).nullable(),
  locale: z.enum(LOCALES),
  theme: z.enum(["light", "dark"]).nullable(),
  screenshots: z.array(z.string()).max(MAX_SCREENSHOTS),
}) satisfies z.ZodType<FeedbackInput>;
