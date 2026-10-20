import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/env/server";
import { answerBotAction } from "@/lib/bot-actions/answer";
import { isBotAuthorized } from "@/lib/bot-actions/secret";
import { RATE_LIMITS, withinRateLimit } from "@/lib/rate-limit";

const body = z.object({
  telegram_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  data: z.string().min(1).max(64),
  language_code: z.string().max(35).nullish(),
});

/**
 * A tap on a button that acts right in the bot (ADR 0006, "Action buttons"). The bot calls it with
 * "Authorization: Bearer <secret derived from the bot token>" and the tapping user's Telegram id; the answer is
 * what the bot shows in the chat. Nothing in the answer or the logs names the user or the booking.
 */
export async function POST(request: Request) {
  const env = serverEnv();
  if (!isBotAuthorized(request.headers.get("authorization"), env.TELEGRAM_BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  // Every tap mints a session for the tapping user (act-as.ts), and Supabase Auth limits those per server.
  if (!(await withinRateLimit(RATE_LIMITS.botAction, String(parsed.data.telegram_id)))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "60" } });
  }
  try {
    const answer = await answerBotAction({
      telegramId: parsed.data.telegram_id,
      data: parsed.data.data,
      languageCode: parsed.data.language_code ?? null,
    });
    return NextResponse.json(answer);
  } catch (error) {
    console.error("bot action failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
