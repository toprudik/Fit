import "server-only";
import { cookies } from "next/headers";
import { HEALTH_NOTICE_COOKIE, isHealthNoticeSeen } from "./notice";

/** Whether this device already closed the health notice in force. */
export async function hasSeenHealthNotice(): Promise<boolean> {
  return isHealthNoticeSeen((await cookies()).get(HEALTH_NOTICE_COOKIE)?.value);
}
