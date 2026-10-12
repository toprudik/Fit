import { NextResponse } from "next/server";
import { clientEnv } from "@/env/client";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 });
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", clientEnv.NEXT_PUBLIC_APP_URL), { status: 303 });
}
