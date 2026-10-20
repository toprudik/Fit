import { expect, type Locator, type Page } from "@playwright/test";
import { makeAdmin, makeTrainer, ok, type Persona } from "./personas";

/*
 * Helpers for the admin, team and settings scenarios. Lists in /admin are shared by every test of the run,
 * so each test gives its people a last name of their own and finds its rows by it.
 */

let counter = 0;

/** A made-up last name no other test of this run uses. */
export function uniqueLastName(base: string): string {
  counter += 1;
  const worker = Number(process.env.TEST_WORKER_INDEX ?? 0);
  return `${base}${worker}${(Date.now() % 1_000_000).toString().padStart(6, "0")}${counter}`;
}

type MakePersona = (options: { firstName: string; lastName?: string; locale?: "ru" | "en"; consent?: boolean }) => Promise<Persona>;

/** An admin with a name of their own, so the audit log's «Кто:» line points at this test. */
export async function namedAdmin(persona: MakePersona, firstName = "Вера"): Promise<Persona & { lastName: string }> {
  const lastName = uniqueLastName("Админ");
  const admin = await persona({ firstName, lastName });
  await makeAdmin(admin);
  return { ...admin, lastName };
}

export async function namedTrainer(persona: MakePersona, firstName: string): Promise<Persona & { lastName: string }> {
  const lastName = uniqueLastName("Тренер");
  const trainer = await persona({ firstName, lastName });
  await makeTrainer(trainer);
  return { ...trainer, lastName };
}

/** A one-page PDF, enough for the certificates bucket. */
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

/** The trainer uploads a certificate and sends it for review, as /trainer/verification does. */
export async function submitVerification(trainer: Persona, title = "Диплом тренера") {
  const id = crypto.randomUUID();
  const path = `${trainer.userId}/${id}.pdf`;
  const bucket = trainer.db.storage.from("certificates");
  const signed = ok(await bucket.createSignedUploadUrl(path), "signed upload url");
  ok(await bucket.uploadToSignedUrl(path, signed.token, PDF, { contentType: "application/pdf" }), "certificate upload");
  ok(await trainer.db.from("trainer_certificates").insert({ id, trainer_id: trainer.userId, title, storage_path: path }), "certificate row");
  ok(await trainer.db.rpc("submit_trainer_verification"), "submit verification");
}

/** Verified the way /admin/verification verifies: the trainer sends a document, an admin approves it. */
export async function verifyTrainer(trainer: Persona, admin: Persona) {
  await submitVerification(trainer);
  ok(await admin.db.rpc("admin_decide_verification", { p_trainer_id: trainer.userId, p_decision: "verified" }), "verify trainer");
}

/** Pro for a trainer, granted by an admin as /admin/plans does. */
export async function grantPro(trainer: Persona, admin: Persona) {
  ok(await admin.db.rpc("admin_grant_plan", { p_user_id: trainer.userId, p_plan_code: "trainer_pro", p_reason: "e2e бета" }), "grant pro");
}

/** Moscow wall-clock time `days` from today at `hour`:`minute`, as an ISO instant. */
export function moscowAt(days: number, hour: number, minute = 0): string {
  const now = new Date();
  const moscow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const date = Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth(), moscow.getUTCDate() + days, hour - 3, minute);
  return new Date(date).toISOString();
}

/** A toast with this text shows up. */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

/** The innermost element that holds both the heading and the given part, as a card in a list. */
export function cardOf(page: Page, heading: Locator, has: Locator): Locator {
  return page.locator("div").filter({ has: heading }).filter({ has }).last();
}
