import { MessageCircleQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ContactAnswer } from "@/components/contact/contact-answer";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { interpolate } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";
import { serverEnv } from "@/env/server";
import { loadContactRequest, SIGNED_OUT } from "@/lib/contact/load";
import { contactRequestPath, contactRequestTelegram } from "@/lib/contact/request";

// A request id is known only at request time.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.contactRequest.title };
}

type Params = PageProps<"/[lang]/contact/[id]">["params"];

async function Answer({ params }: { params: Params }) {
  const { id } = await params;
  const [t, request] = await Promise.all([getDictionary(), loadContactRequest(id)]);
  const copy = t.contactRequest;
  if (request === SIGNED_OUT) {
    return (
      <EmptyState
        icon={MessageCircleQuestion}
        title={copy.signedOut}
        description={copy.signedOutText}
        action={
          <Button asChild size="lg">
            <Link href={`/login?next=${encodeURIComponent(contactRequestPath(id))}`}>{t.intake.signIn}</Link>
          </Button>
        }
      />
    );
  }
  if (!request) notFound();
  const name = request.requesterName || (request.requesterSide === "trainer" ? t.botMessages.unnamedTrainer : t.botMessages.unnamedClient);
  return (
    <section aria-labelledby="contact-request" className="flex flex-col gap-4">
      <h2 id="contact-request" className="text-title-3">
        {interpolate(request.requesterSide === "trainer" ? copy.askedByTrainer : copy.askedByClient, { name })}
      </h2>
      <ContactAnswer
        requestId={request.id}
        name={name}
        status={request.status}
        telegramHref={contactRequestTelegram(request.id, serverEnv().TELEGRAM_BOT_USERNAME)}
      />
    </section>
  );
}

/**
 * "Попросить связаться", the asked side (PRD wave-1 §2.12-2, PRIV-2): the bot message С1 opens it. Sharing the
 * contact goes through Telegram's own popup, so the requester gets only what Telegram vouches for.
 */
export default async function ContactRequestPage(props: PageProps<"/[lang]/contact/[id]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.contactRequest.title} back={{ fallbackHref: "/" }} />}>
      <Suspense
        fallback={
          <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        }
      >
        <Answer params={props.params} />
      </Suspense>
    </Screen>
  );
}
