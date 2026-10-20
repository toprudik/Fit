"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { preferenceCookieOptions } from "@/lib/preferences";
import { HEALTH_NOTICE_COOKIE, HEALTH_NOTICE_VERSION } from "./notice";

/** "Понятно" on the health notice: this device stops showing it until the next version. */
export async function acknowledgeHealthNotice(): Promise<void> {
  (await cookies()).set(HEALTH_NOTICE_COOKIE, HEALTH_NOTICE_VERSION, preferenceCookieOptions);
  refresh();
}
