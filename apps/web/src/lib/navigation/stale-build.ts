/*
 * A page left open across a deployment still runs the old build. Its next screen may need a chunk the
 * new deployment no longer serves (QA 22.10: 404 on /_next/static/chunks/… in an open Mini App), and
 * Vercel's Skew Protection is not on the Hobby plan. Reloading the page once picks up the new build.
 */

const RELOADED_AT = "dafit:stale-build-reload";
/** A second failure within this time after a reload is a real error, not an old build: no reload loop. */
const RELOAD_GUARD_MS = 30_000;

/** True for the error a failed load of a script or style chunk throws (Turbopack and webpack). */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "ChunkLoadError" || /Failed to load chunk|Loading (CSS )?chunk .+ failed/.test(error.message);
}

/**
 * Reloads the page to get the new build, unless it did so a moment ago. Returns whether it reloads, so
 * the caller can skip its error screen and report.
 */
export function reloadForNewBuild(now = Date.now()): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOADED_AT));
    if (last && now - last < RELOAD_GUARD_MS) return false;
    window.sessionStorage.setItem(RELOADED_AT, String(now));
  } catch {
    // Without sessionStorage there is no guard against a loop, so no reload either.
    return false;
  }
  window.location.reload();
  return true;
}
