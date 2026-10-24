import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import Link from "next/link";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.team.accept.title };
}

/** A helper or substitute invite opened without a trainer profile (QA bug 14): the proxy sends it here from /trainer/team/accept. */
export default async function TrainerInviteForClientPage() {
  const t = await getDictionary();
  const copy = t.team.accept;
  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/client" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <EmptyState
          icon={UserPlus}
          title={copy.forTrainer}
          description={copy.forTrainerText}
          action={
            <div className="flex flex-col gap-3">
              <Button asChild>
                <Link href="/onboarding/trainer">{copy.enterCode}</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/client">{copy.home}</Link>
              </Button>
            </div>
          }
        />
      </div>
    </Screen>
  );
}
