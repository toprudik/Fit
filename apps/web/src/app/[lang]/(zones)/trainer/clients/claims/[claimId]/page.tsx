import type { Metadata } from "next";
import { ClaimScreen } from "@/components/pairs/claim";
import { ClientsDetail } from "@/components/pairs/clients-detail";
import { getDictionary } from "@/i18n/server";

// The claim id is known only at request time, so the page renders on request (as the client card does).
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.pairs.claims.title };
}

async function ClaimFromParams({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  return <ClaimScreen claimId={claimId} />;
}

/** "Это тот же клиент?" (screens.md /trainer/clients/claims/[claimId], PRD wave-1 §2.5-3a). */
export default function ClaimPage(props: PageProps<"/[lang]/trainer/clients/claims/[claimId]">) {
  return (
    <ClientsDetail>
      <ClaimFromParams params={props.params} />
    </ClientsDetail>
  );
}
