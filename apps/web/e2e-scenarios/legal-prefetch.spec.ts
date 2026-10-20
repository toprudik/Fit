import { expect, test } from "./support/fixtures";
import { expectPath, newTrainerInviteCode } from "./support/trainer";

/**
 * Becoming a trainer revalidates every page (revalidatePath("/", "layout")), so the next request for a legal document
 * renders it again on the server. The router prefetches those documents from the consent sheets and the footer
 * links; that render once answered 500 for the shell of /legal/[doc].
 */
test("legal documents still open and prefetch after the app's pages were revalidated", async ({ persona }) => {
  const code = await newTrainerInviteCode();
  const person = await persona({ firstName: "Олег" });
  const { page } = person;
  await page.goto(`/onboarding/trainer?code=${code}`);
  await page.getByRole("button", { name: "Стать тренером" }).click();
  await expectPath(page, "/onboarding/trainer/profile");

  for (const doc of ["public-data", "terms", "privacy", "health-data", "no-such-document"]) {
    for (const segment of ["/_tree", "/$d$lang/legal/$d$doc/__PAGE__"]) {
      const response = await page.request.get(`/legal/${doc}`, {
        headers: { rsc: "1", "next-router-prefetch": "1", "next-router-segment-prefetch": segment, "next-url": "/ru/trainer" },
      });
      expect(response.status(), `${doc} ${segment}`).toBeLessThan(500);
    }
    const document = await page.request.get(`/legal/${doc}`);
    expect(document.status(), doc).toBeLessThan(doc === "no-such-document" ? 500 : 300);
  }
});
