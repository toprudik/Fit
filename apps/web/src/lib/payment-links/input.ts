import { z } from "zod";
import { PAYMENT_LINK_KINDS } from "@/lib/trainer-wizard/options";

/** A payment link as the trainer types it: only https:// addresses are kept (PRD wave-1 §2.8 rule 15, MONEY-11). */
export const paymentLinkInput = z.object({
  title: z.string().trim().min(1).max(64),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((value) => URL.canParse(value) && new URL(value).protocol === "https:", { path: ["url"] }),
  kind: z.enum(PAYMENT_LINK_KINDS),
});
