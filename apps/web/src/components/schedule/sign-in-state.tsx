import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/server";

/** What a schedule screen shows without a session: sign in and come back to `next`. */
export async function ScheduleSignIn({ title, next }: { title: string; next: string }) {
  const t = await getDictionary();
  return (
    <EmptyState
      icon={CalendarDays}
      title={title}
      description={t.schedule.signedOutText}
      action={
        <Button asChild>
          <Link href={`/login?next=${encodeURIComponent(next)}`}>{t.schedule.signIn}</Link>
        </Button>
      }
    />
  );
}
