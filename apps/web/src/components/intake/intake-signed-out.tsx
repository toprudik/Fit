import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Dictionary } from "@/i18n/dictionaries";

/** A signed-out visitor of an intake page: sign in and come back to the same page. */
export function IntakeSignedOut({ t, next }: { t: Dictionary; next: string }) {
  const copy = t.intake;
  return (
    <EmptyState
      icon={ClipboardList}
      title={copy.signedOut}
      description={copy.signedOutText}
      action={
        <Button asChild size="lg">
          <Link href={`/login?next=${encodeURIComponent(next)}`}>{copy.signIn}</Link>
        </Button>
      }
    />
  );
}
