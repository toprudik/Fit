import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Dictionary } from "@/i18n/dictionaries";

/** A signed-out visitor of "Доступ к данным": sign in and come back to the same page. */
export function SharingSignedOut({ t, next }: { t: Dictionary; next: string }) {
  return (
    <EmptyState
      icon={ShieldCheck}
      title={t.sharing.signedOut}
      description={t.sharing.signedOutText}
      action={
        <Button asChild size="lg">
          <Link href={`/login?next=${encodeURIComponent(next)}`}>{t.intake.signIn}</Link>
        </Button>
      }
    />
  );
}
