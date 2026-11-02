import { describe, expect, it } from "vitest";
import { storyLink } from "./link";

const names = { showcase: "Витрина тренера", app: "DaFit" };

describe("storyLink", () => {
  it("leads to the trainer's showcase when the card carries it", () => {
    expect(storyLink("anna-fit", "fitconnection_bot", names)).toEqual({
      url: "https://t.me/fitconnection_bot?startapp=tp_anna-fit",
      name: "Витрина тренера",
    });
  });

  it("leads to DaFit's bot otherwise", () => {
    expect(storyLink(undefined, "fitconnection_bot", names)).toEqual({ url: "https://t.me/fitconnection_bot", name: "DaFit" });
  });

  it("keeps the name within Telegram's 48 characters", () => {
    expect(storyLink(null, "fitconnection_bot", { showcase: "", app: "x".repeat(60) }).name).toHaveLength(48);
  });
});
