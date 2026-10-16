import { createClient } from "@supabase/supabase-js";
import { clientEnv } from "@/env/client";

/**
 * Uploads a file from the browser to a one-time Storage URL that a server action created for the signed-in
 * user (createSignedUploadUrl checks the storage policies then). The browser holds no session: the token in
 * the URL is the whole permission, so this client gets only the publishable key and never reads user data.
 */
export async function uploadToSignedUrl(bucket: string, path: string, token: string, file: File): Promise<boolean> {
  const storage = createClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage;
  const { error } = await storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType: file.type });
  return !error;
}
