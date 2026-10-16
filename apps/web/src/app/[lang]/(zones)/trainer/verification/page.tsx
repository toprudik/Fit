import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { ListGroup } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { DeleteDocumentButton } from "@/components/verification/delete-document-button";
import { DocumentUploadForm } from "@/components/verification/document-upload-form";
import { SubmitVerificationButton } from "@/components/verification/submit-verification-button";
import { getDictionary } from "@/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_DOCUMENTS } from "@/lib/verification/documents";
import { STATUS_TONE } from "@/lib/verification/status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.verification.title };
}

/** Signed links to the trainer's own files live this long; the page renders new ones on every visit. */
const LINK_TTL_SECONDS = 600;

async function VerificationContent() {
  const t = await getDictionary();
  const copy = t.verification;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) notFound();

  const [{ data: trainer }, { data: documents, error }, { data: rejection }] = await Promise.all([
    supabase.from("trainer_profiles").select("verification_status").eq("user_id", userId).maybeSingle(),
    supabase.from("trainer_certificates").select("id, title, storage_path").eq("trainer_id", userId).order("created_at"),
    supabase
      .from("trainer_verifications")
      .select("reason")
      .eq("trainer_id", userId)
      .eq("decision", "rejected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  // Verification belongs to the trainer zone; everyone else has nothing here.
  if (!trainer) notFound();
  if (error) throw new Error(`loading certificates failed: ${error.code}`);

  const status = trainer.verification_status;
  const editable = status === "not_submitted" || status === "rejected";
  const { data: links } = documents.length
    ? await supabase.storage.from("certificates").createSignedUrls(
        documents.map((document) => document.storage_path),
        LINK_TTL_SECONDS,
      )
    : { data: [] };
  const linkByPath = new Map((links ?? []).flatMap((link) => (link.path && link.signedUrl ? [[link.path, link.signedUrl]] : [])));

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="verification-status" className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="verification-status" className="text-headline">
            {copy.statusHeader}
          </h2>
          <Badge tone={STATUS_TONE[status]}>{copy.status[status]}</Badge>
        </div>
        <p className="text-callout text-ink-2">{copy.statusText[status]}</p>
        {status === "rejected" && rejection?.reason ? (
          <div className="flex flex-col gap-1 rounded-md bg-danger-soft p-3">
            <p className="text-footnote font-semibold text-danger">{copy.reason}</p>
            <p className="text-callout break-words text-ink">{rejection.reason}</p>
          </div>
        ) : null}
      </section>

      <div className="flex flex-col gap-3">
        <ListGroup header={copy.documents.header} footer={copy.documents.footer} headingLevel={2}>
          {documents.length === 0 ? <p className="px-4 py-3 text-body text-ink-2">{copy.documents.empty}</p> : null}
          {documents.map((document) => {
            const href = linkByPath.get(document.storage_path);
            return (
              // Not a ListRow: the file opens in a new tab and the delete button needs room on a phone.
              <div
                key={document.id}
                className="relative flex flex-col gap-2 px-4 py-3 before:pointer-events-none before:absolute before:-top-px before:right-0 before:left-4 before:h-px before:bg-line"
              >
                <div className="flex items-center gap-3">
                  <FileText aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-ink-2" />
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="min-w-0 text-body break-words text-accent-ink underline-offset-2 hover:underline">
                      {document.title}
                    </a>
                  ) : (
                    <span className="min-w-0 text-body break-words">{document.title}</span>
                  )}
                </div>
                {editable ? <DeleteDocumentButton documentId={document.id} /> : null}
              </div>
            );
          })}
        </ListGroup>
        {editable && documents.length < MAX_DOCUMENTS ? <DocumentUploadForm /> : null}
      </div>

      {editable ? <SubmitVerificationButton again={status === "rejected"} hasDocuments={documents.length > 0} /> : null}
    </div>
  );
}

/**
 * The trainer's verification (PRD wave-1 §2.2-4, 5, TINV-5): status, the reason of a rejection, up to five
 * documents, and sending them for review. Work never waits for it (Q55).
 */
export default async function TrainerVerificationPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.verification.title} back={{ fallbackHref: "/trainer" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <VerificationContent />
        </Suspense>
      </div>
    </Screen>
  );
}
