import { ShieldAlert, ShieldCheck } from "lucide-react";
import { ListGroup, ListRow } from "@/components/ui/list";
import { getDictionary } from "@/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The verification row on the trainer's Today screen until the documents are verified (screens.md §3.1:
 * «на проверке», «Верификация отклонена»). Reads cookies, so it renders inside a Suspense boundary.
 */
export async function VerificationBanner() {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;
  const { data: trainer } = await supabase.from("trainer_profiles").select("verification_status").eq("user_id", userId).maybeSingle();
  if (!trainer || trainer.verification_status === "verified") return null;

  const t = await getDictionary();
  const status = trainer.verification_status;
  const copy = t.verification.banner[status];
  return (
    <ListGroup className="w-full max-w-2xl pt-4 md:pt-0">
      <ListRow
        icon={status === "rejected" ? ShieldAlert : ShieldCheck}
        iconTone={status === "not_submitted" ? "accent" : "default"}
        tone={status === "rejected" ? "danger" : "default"}
        title={copy.title}
        subtitle={copy.text}
        href="/trainer/verification"
      />
    </ListGroup>
  );
}
