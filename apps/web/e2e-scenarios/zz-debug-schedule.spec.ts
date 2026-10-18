import AxeBuilder from "@axe-core/playwright";
import { settle } from "../e2e/support";
import { test } from "./support/fixtures";
import { gotoReady, mskDay, tap } from "./support/schedule";

test("debug contrast", async ({ trainer, client }) => {
  const page = trainer.page;
  await gotoReady(page, `/trainer/sessions/new?coaching=${client.coachingId}`);
  const info = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('nav a[href$="schedule"] .truncate, nav a[href$="clients"] .truncate')].map((el) => {
        const cs = getComputedStyle(el);
        let op = 1;
        for (let n: Element | null = el; n; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
        return { text: el.textContent, color: cs.color, op, anims: document.getAnimations().map((a) => [a.constructor.name, a.playState, (a as CSSTransition).transitionProperty]) };
      }),
    );
  console.log("before", JSON.stringify(await info()));
  await page.getByLabel("Дата").fill(mskDay(4));
  await page.getByLabel("Начало").fill("18:30");
  await tap(page.getByRole("button", { name: "Назначить" }));
  await page.waitForURL(/schedule\?date/);
  console.log("after", JSON.stringify(await info()));
  for (let i = 0; i < 12; i++) {
    const r = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
    const toast = await page.locator("[data-sonner-toast]").evaluateAll((els) => els.map((e) => [getComputedStyle(e).opacity, e.getBoundingClientRect().top, e.getAttribute("data-removed")]));
    console.log("loop", i, Date.now() % 100000, JSON.stringify(toast), JSON.stringify(r.violations.map((v) => v.nodes.map((n) => n.failureSummary))));
    await page.waitForTimeout(400);
  }
  await settle(page);
  console.log("settled", JSON.stringify(await info()));
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
  console.log(JSON.stringify(violations.map((v) => v.nodes.map((n) => n.failureSummary))));
  await page.waitForTimeout(2000);
  console.log("later", JSON.stringify(await info()));
  const again = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
  console.log("again", again.violations.length);
});
