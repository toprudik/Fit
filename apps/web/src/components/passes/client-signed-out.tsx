import { LogIn } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Dictionary } from "@/i18n/dictionaries";

/**
 * A client screen opened without a session (after "Выйти", or in another browser): sign in and come back, rather
 * than an empty list that reads as if the passes were gone (QA B10).
 */
export function ClientSignedOut({ t, title, text, next }: { t: Dictionary; title: string; text: string; next: string }) {
  return (
    <EmptyState
      icon={LogIn}
      title={title}
      description={text}
      action={
        <Button asChild size="lg">
          <Link href={`/login?next=${encodeURIComponent(next)}`}>{t.intake.signIn}</Link>
        </Button>
      }
    />
  );
}
