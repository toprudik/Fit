import { describe, expect, it } from "vitest";
import { parseSourceCookie, sourceCookieValue, sourceFromSearch, sourceFromStartParam, sourceLabel, splitStartParam } from "./source";

describe("sourceLabel", () => {
  it("takes a short plain word, lowercased", () => {
    expect(sourceLabel("VK")).toBe("vk");
    expect(sourceLabel(" promo-1 ")).toBe("promo-1");
  });

  it("drops anything that could carry a person or a sentence", () => {
    expect(sourceLabel(null)).toBeNull();
    expect(sourceLabel("")).toBeNull();
    expect(sourceLabel("Ivan Petrov")).toBeNull();
    expect(sourceLabel("a@b.example")).toBeNull();
    expect(sourceLabel("-vk")).toBeNull();
    expect(sourceLabel("a".repeat(65))).toBeNull();
  });
});

describe("start parameter", () => {
  it("splits off the last __s_<label>", () => {
    expect(splitStartParam("tp_anna-fit__s_vk")).toEqual({ param: "tp_anna-fit", label: "vk" });
    expect(splitStartParam("tp_anna-fit")).toEqual({ param: "tp_anna-fit", label: null });
    expect(splitStartParam("tp_a__s_Ivan Petrov")).toEqual({ param: "tp_a__s_Ivan Petrov", label: null });
  });

  it("reads ch_<label> and the suffix as the source", () => {
    expect(sourceFromStartParam("ch_tg")).toEqual({ source: "tg", campaign: null });
    expect(sourceFromStartParam("ti_ABCDEFGHJKLM__s_yt")).toEqual({ source: "yt", campaign: null });
    expect(sourceFromStartParam("ti_ABCDEFGHJKLM")).toBeNull();
    expect(sourceFromStartParam("ch_")).toBeNull();
    expect(sourceFromStartParam(null)).toBeNull();
  });
});

describe("sourceFromSearch", () => {
  it("prefers src, then utm_source with utm_campaign, then the bot's start parameter", () => {
    expect(sourceFromSearch(new URLSearchParams("src=vk&utm_source=ig"))).toEqual({ source: "vk", campaign: null });
    expect(sourceFromSearch(new URLSearchParams("utm_source=IG&utm_campaign=Autumn-26"))).toEqual({ source: "ig", campaign: "autumn-26" });
    expect(sourceFromSearch(new URLSearchParams("tgWebAppStartParam=ch_max"))).toEqual({ source: "max", campaign: null });
    expect(sourceFromSearch(new URLSearchParams("weeks=12"))).toBeNull();
  });

  it("drops a campaign that is not a plain word", () => {
    expect(sourceFromSearch(new URLSearchParams("utm_source=vk&utm_campaign=a%20b"))).toEqual({ source: "vk", campaign: null });
  });
});

describe("source cookie", () => {
  it("round-trips a label and a campaign", () => {
    expect(parseSourceCookie(sourceCookieValue({ source: "vk", campaign: "autumn" }))).toEqual({ source: "vk", campaign: "autumn" });
    expect(parseSourceCookie(sourceCookieValue({ source: "tg", campaign: null }))).toEqual({ source: "tg", campaign: null });
  });

  it("ignores a value it did not write", () => {
    expect(parseSourceCookie(undefined)).toBeNull();
    expect(parseSourceCookie("a.b.c")).toBeNull();
    expect(parseSourceCookie("Ivan Petrov")).toBeNull();
  });
});
