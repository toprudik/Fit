import { expect, test } from "./support/fixtures";

test("a trainer signed in through the Mini App endpoint lands in the trainer zone", async ({ trainer }) => {
  await trainer.page.goto("/trainer");
  await expect(trainer.page.getByRole("heading", { level: 1, name: "Сегодня" }).first()).toBeVisible();
});

test("a client sees the trainer on the Тренеры tab", async ({ client }) => {
  await client.page.goto("/client/trainers");
  await expect(client.page.getByText("Иван").first()).toBeVisible();
});
