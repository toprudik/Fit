"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DOCUMENT_TYPES, documentPath, documentProblem, MAX_DOCUMENTS, MAX_TITLE_LENGTH } from "./documents";

/**
 * Documents can change only while there is nothing under review: before the first submission and after a
 * rejection (PRD wave-1 §2.2-5). Pending and verified documents stay as the admin saw them.
 */
const EDITABLE = new Set(["not_submitted", "rejected"]);

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** The signed-in trainer and their verification status, or null for anyone else. */
async function currentTrainer(supabase: ServerClient) {
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;
  const { data } = await supabase.from("trainer_profiles").select("verification_status").eq("user_id", userId).maybeSingle();
  return data ? { userId, status: data.verification_status } : null;
}

const titleSchema = z.string().trim().min(1).max(MAX_TITLE_LENGTH);

const prepareInput = z.object({
  title: titleSchema,
  type: z.enum(Object.keys(DOCUMENT_TYPES) as [keyof typeof DOCUMENT_TYPES]),
  size: z.number().int(),
});

export type PrepareUploadResult =
  | { status: "ready"; id: string; path: string; token: string }
  | { status: "invalid" | "limit" | "locked" | "failed" };

/**
 * Step 1 of "Добавить документ": a one-time upload URL for the trainer's own folder. The file goes from the
 * browser straight to Storage (Vercel functions take at most 4.5 MB per request); the bucket checks its type
 * and size again, and the storage policy checks the folder.
 */
export async function prepareDocumentUpload(input: { title: string; type: string; size: number }): Promise<PrepareUploadResult> {
  const parsed = prepareInput.safeParse(input);
  if (!parsed.success || documentProblem(parsed.data)) return { status: "invalid" };

  const supabase = await createSupabaseServerClient();
  const trainer = await currentTrainer(supabase);
  if (!trainer) return { status: "failed" };
  if (!EDITABLE.has(trainer.status)) return { status: "locked" };

  const { count } = await supabase.from("trainer_certificates").select("id", { count: "exact", head: true }).eq("trainer_id", trainer.userId);
  if ((count ?? 0) >= MAX_DOCUMENTS) return { status: "limit" };

  const id = crypto.randomUUID();
  const path = documentPath(trainer.userId, id, parsed.data.type);
  const { data, error } = await supabase.storage.from("certificates").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("preparing a certificate upload failed", error?.name);
    return { status: "failed" };
  }
  return { status: "ready", id, path, token: data.token };
}

const saveInput = z.object({ id: z.uuid(), path: z.string(), title: titleSchema });

export type SaveDocumentResult = { status: "saved" | "invalid" | "limit" | "locked" | "failed" };

/** Step 2: the row for the uploaded file. A file that has no row is removed, so nothing is left behind. */
export async function saveDocument(input: { id: string; path: string; title: string }): Promise<SaveDocumentResult> {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { id, path, title } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const trainer = await currentTrainer(supabase);
  if (!trainer) return { status: "failed" };
  // Only the name step 1 gave out: the trainer's folder, this id, one of the accepted extensions.
  const extension = path.slice(path.lastIndexOf(".") + 1);
  if (!Object.values(DOCUMENT_TYPES).some((ext) => ext === extension) || path !== `${trainer.userId}/${id}.${extension}`) {
    return { status: "invalid" };
  }

  const bucket = supabase.storage.from("certificates");
  const result = await (async (): Promise<SaveDocumentResult> => {
    if (!EDITABLE.has(trainer.status)) return { status: "locked" };
    const { data: uploaded } = await bucket.exists(path);
    if (!uploaded) return { status: "failed" };
    const { error } = await supabase.from("trainer_certificates").insert({ id, trainer_id: trainer.userId, title, storage_path: path });
    if (!error) return { status: "saved" };
    if (error.message === "certificate_limit") return { status: "limit" };
    console.error("saving a certificate failed", error.code);
    return { status: "failed" };
  })();

  if (result.status === "saved") refresh();
  else await bucket.remove([path]);
  return result;
}

/** "Удалить" next to a document: the row, then the file. */
export async function deleteDocument(documentId: string): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(documentId).success) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const trainer = await currentTrainer(supabase);
  if (!trainer || !EDITABLE.has(trainer.status)) return { ok: false };

  const { data: removed, error } = await supabase
    .from("trainer_certificates")
    .delete()
    .eq("id", documentId)
    .eq("trainer_id", trainer.userId)
    .select("storage_path")
    .maybeSingle();
  if (error || !removed) {
    if (error) console.error("deleting a certificate failed", error.code);
    return { ok: false };
  }
  const { error: storageError } = await supabase.storage.from("certificates").remove([removed.storage_path]);
  if (storageError) console.error("removing a certificate file failed", storageError.name);
  refresh();
  return { ok: true };
}

export type SubmitResult = { status: "submitted" | "no-documents" | "failed" };

/** "Отправить на проверку" and "Отправить снова": submit_trainer_verification checks the status and the files. */
export async function submitVerification(): Promise<SubmitResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_trainer_verification");
  if (!error) {
    refresh();
    return { status: "submitted" };
  }
  if (error.message === "no_documents") return { status: "no-documents" };
  // Sent from another device in the meantime: the screen shows the status as it is now.
  if (error.message === "verification_pending" || error.message === "already_verified") refresh();
  else console.error("submitting verification failed", error.code);
  return { status: "failed" };
}
