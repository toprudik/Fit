export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fail fast at server boot if secrets are missing or malformed.
    const { serverEnv } = await import("@/env/server");
    serverEnv();
  }
}
