/**
 * Uploads a file from the browser to a one-time Storage URL that a server action created for the signed-in
 * user (createSignedUploadUrl checks the storage policies then). The browser holds no session: the token in
 * the URL is the whole permission, so the request carries only the publishable key and reads no user data.
 *
 * A plain fetch instead of supabase-js keeps the Supabase client (auth, realtime, postgrest) and zod out of
 * the browser bundle; this is the same request storage-js sends for uploadToSignedUrl. The NEXT_PUBLIC_*
 * values are inlined at build time and validated on the server by env/client.
 */
export async function uploadToSignedUrl(bucket: string, path: string, token: string, file: File): Promise<boolean> {
  // The project URL may come with a trailing slash ("https://x.supabase.co/"): drop it, or the path starts with "//".
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const url = new URL(`${base}/storage/v1/object/upload/sign/${bucket}/${path}`);
  url.searchParams.set("token", token);
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: { apikey: key, "x-upsert": "false", "content-type": file.type, "cache-control": "max-age=3600" },
      body: file,
    });
    return response.ok;
  } catch {
    return false;
  }
}
