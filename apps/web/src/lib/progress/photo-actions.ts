"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { isDay, todayIn } from "@/lib/passes/present";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isBlurMethod, isPhotoAngle, MAX_PHOTO_SIDE, PHOTO_BUCKET, PHOTO_TYPES, photoPath, type BlurMethod, type PhotoAngle, type PhotoType } from "./photos";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function signedIn(supabase: Supabase): Promise<{ id: string; timeZone: string } | null> {
  const { data: session } = await supabase.auth.getClaims();
  const id = session?.claims.sub;
  if (!id) return null;
  const { data } = await supabase.from("user_settings").select("time_zone").eq("user_id", id).maybeSingle();
  return { id, timeZone: data?.time_zone ?? "Europe/Moscow" };
}

export type PreparePhotoResult =
  | { status: "ready"; id: string; path: string; token: string; replaceId: string | null }
  | { status: "invalid" | "failed" };

/**
 * Step 1 of an upload: a one-time Storage URL for the blurred copy in the client's own folder (the storage
 * policy checks the folder). A photo of the same date and angle is replaced, not duplicated (R82).
 */
export async function prepareProgressPhoto(input: { angle: PhotoAngle; date: string; type: PhotoType }): Promise<PreparePhotoResult> {
  if (!isPhotoAngle(input.angle) || !isDay(input.date) || !Object.hasOwn(PHOTO_TYPES, input.type)) return { status: "invalid" };
  const supabase = await createSupabaseServerClient();
  const me = await signedIn(supabase);
  if (!me) return { status: "invalid" };
  if (input.date > todayIn(me.timeZone) || input.date < "1900-01-01") return { status: "invalid" };
  const { data: existing, error } = await supabase
    .from("progress_photos")
    .select("id")
    .eq("client_id", me.id)
    .eq("taken_on", input.date)
    .eq("angle", input.angle)
    .maybeSingle();
  if (error) {
    console.error("looking up a progress photo failed", error.code);
    return { status: "failed" };
  }
  const id = crypto.randomUUID();
  const path = photoPath(me.id, id, input.type);
  const upload = await supabase.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
  if (upload.error || !upload.data) {
    console.error("preparing a progress photo upload failed", upload.error?.name);
    return { status: "failed" };
  }
  return { status: "ready", id, path, token: upload.data.token, replaceId: existing?.id ?? null };
}

const saveInput = z.object({
  id: z.uuid(),
  path: z.string().max(200),
  angle: z.string().refine(isPhotoAngle),
  date: z.string().refine(isDay),
  blurMethod: z.string().refine(isBlurMethod),
  width: z.number().int().min(1).max(MAX_PHOTO_SIDE),
  height: z.number().int().min(1).max(MAX_PHOTO_SIDE),
  replaceId: z.uuid().nullable(),
});

export type SavePhotoResult = { status: "saved" | "limit" | "invalid" | "failed" };

/**
 * Step 2: the row for the uploaded copy, or a retake of the photo it replaces (replace_progress_photo swaps
 * the rows in one transaction; the old object goes only after that). The database applies the Free limit:
 * a refused row means "limit", and the uploaded object is removed so nothing is left without a row.
 */
export async function saveProgressPhoto(input: {
  id: string;
  path: string;
  angle: PhotoAngle;
  date: string;
  blurMethod: BlurMethod;
  width: number;
  height: number;
  replaceId: string | null;
}): Promise<SavePhotoResult> {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { id, path, angle, date, width, height, replaceId } = parsed.data;
  const method = parsed.data.blurMethod as BlurMethod;
  const supabase = await createSupabaseServerClient();
  const me = await signedIn(supabase);
  if (!me) return { status: "invalid" };
  // Only the name step 1 gave out: the client's folder, this id, one of the accepted extensions.
  if (!Object.keys(PHOTO_TYPES).some((type) => photoPath(me.id, id, type as PhotoType) === path)) return { status: "invalid" };
  const storage = supabase.storage.from(PHOTO_BUCKET);

  let oldPath: string | null = null;
  let error: { code: string } | null;
  if (replaceId) {
    const { data: old } = await supabase.from("progress_photos").select("storage_path").eq("id", replaceId).eq("client_id", me.id).maybeSingle();
    oldPath = old?.storage_path ?? null;
    ({ error } = await supabase.rpc("replace_progress_photo", {
      p_photo_id: replaceId,
      p_new_id: id,
      p_storage_path: path,
      p_face_blurred: true,
      p_blur_method: method,
      p_width: width,
      p_height: height,
    }));
  } else {
    ({ error } = await supabase.from("progress_photos").insert({
      id,
      client_id: me.id,
      angle: angle as PhotoAngle,
      taken_on: date,
      storage_path: path,
      face_blurred: true,
      blur_method: method,
      width,
      height,
    }));
  }
  if (error) {
    await storage.remove([path]);
    // 42501: the insert policy refused it, which for the client's own photo means the Free set limit.
    if (error.code === "42501") return { status: "limit" };
    console.error("saving a progress photo failed", error.code);
    return { status: "failed" };
  }
  if (oldPath) await storage.remove([oldPath]);
  refresh();
  return { status: "saved" };
}

/** Removes the client's photo: the row first, so no link is signed for it any more, then the object. */
export async function deleteProgressPhoto(id: string): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(id).success) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("progress_photos").delete().eq("id", id).select("storage_path");
  if (error || !data.length) return { ok: false };
  await supabase.storage.from(PHOTO_BUCKET).remove(data.map((row) => row.storage_path));
  refresh();
  return { ok: true };
}
