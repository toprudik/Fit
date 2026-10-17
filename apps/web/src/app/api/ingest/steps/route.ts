import { NextResponse } from "next/server";
import { dictionaries } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { shortcutSteps } from "@/lib/activity/activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Refusal = "bad_token" | "rate_limited" | "too_many_steps" | "bad_steps" | "bad_day" | "bad_request";

const STATUS: Record<Refusal, number> = {
  bad_token: 401,
  rate_limited: 429,
  too_many_steps: 422,
  bad_steps: 422,
  bad_day: 422,
  bad_request: 400,
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The shortcut's own language: a Russian iPhone asks in Russian, everything else gets English. */
function copyFor(request: Request) {
  const russian = (request.headers.get("accept-language") ?? "").toLowerCase().startsWith("ru");
  return dictionaries[russian ? "ru" : "en"].activity.ingest;
}

function answer(request: Request, status: number, message: string) {
  return NextResponse.json({ ok: status === 200, message }, { status, headers: { "cache-control": "no-store" } });
}

/**
 * Steps from iOS Shortcuts (PRD wave-2 §4.3): `POST /api/ingest/steps` with `Authorization: Bearer <token>` and
 * `{"steps": 8532, "date": "2026-10-17"}` (date optional: the user's today). Nobody is signed in here, so the
 * secret key calls public.ingest_steps, which checks the token's hash, the hourly limit and the numbers. The
 * answer is a short sentence the shortcut shows.
 */
export async function POST(request: Request) {
  const copy = copyFor(request);
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return answer(request, 401, copy.bad_token);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return answer(request, 400, copy.bad_request);
  }
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const steps = shortcutSteps(input.steps);
  const date = typeof input.date === "string" && input.date.trim() ? input.date.trim().slice(0, 10) : undefined;
  if (steps === null) return answer(request, 422, copy.bad_steps);
  if (date !== undefined && !DAY.test(date)) return answer(request, 422, copy.bad_day);

  const { data, error } = await createSupabaseAdminClient().rpc("ingest_steps", {
    p_token: token.slice(0, 200),
    p_steps: steps,
    p_day: date,
  });
  if (error) {
    console.error("ingesting steps failed", error.code);
    return answer(request, 503, copy.failed);
  }
  if (data === "ok") return answer(request, 200, interpolate(copy.ok, { steps }));
  const refusal = (Object.keys(STATUS) as Refusal[]).find((r) => r === data) ?? "bad_request";
  return answer(request, STATUS[refusal], copy[refusal]);
}

/** The token only writes steps: reading with it is refused (4.4). */
export function GET(request: Request) {
  return answer(request, 401, copyFor(request).bad_token);
}
