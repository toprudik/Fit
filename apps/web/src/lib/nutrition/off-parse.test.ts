import { describe, expect, it } from "vitest";
import { localNamesFirst, normalizeBarcode, parseOffDraft, parseOffProduct } from "./off-parse";

describe("parseOffProduct", () => {
  it("reads the search hit in the interface language", () => {
    expect(
      parseOffProduct(
        {
          code: "4607016249292",
          brands: ["ООО Ресурс"],
          product_name: "Buckwheat",
          product_name_ru: "Гречка алтайская",
          nutriments: { "energy-kcal_100g": 350, proteins_100g: 13, fat_100g: 2.5, carbohydrates_100g: 68 },
          serving_quantity: "50",
          serving_size: "50 г",
        },
        "ru",
      ),
    ).toEqual({
      code: "4607016249292",
      name: "Гречка алтайская",
      brand: "ООО Ресурс",
      kcal: 350,
      protein: 13,
      fat: 2.5,
      carbs: 68,
      serving_g: 50,
      serving_label: "50 г",
      lang: "ru",
    });
  });

  it("falls back to kJ and to the main name, and splits brands", () => {
    const item = parseOffProduct(
      { code: "123", product_name: "Oats", lang: "en", brands: "Brand A, Brand B", nutriments: { "energy-kj_100g": 1464 } },
      "ru",
    );
    expect(item).toMatchObject({ name: "Oats", brand: "Brand A", kcal: 349.9, protein: null, serving_g: null, lang: "en" });
  });

  it("drops products the diary cannot count", () => {
    expect(parseOffProduct({ code: "1", product_name: "No kcal", nutriments: {} }, "ru")).toBeNull();
    expect(parseOffProduct({ code: "1", product_name: "Too much", nutriments: { "energy-kcal_100g": 1200 } }, "ru")).toBeNull();
    expect(
      parseOffProduct(
        { code: "1", product_name: "Broken", nutriments: { "energy-kcal_100g": 300, proteins_100g: 80, fat_100g: 30 } },
        "ru",
      ),
    ).toBeNull();
    expect(parseOffProduct({ product_name: "No code", nutriments: { "energy-kcal_100g": 100 } }, "ru")).toBeNull();
    expect(parseOffProduct(null, "ru")).toBeNull();
  });
});

describe("normalizeBarcode", () => {
  it("keeps 8 to 14 digits and drops spaces and dashes", () => {
    expect(normalizeBarcode("4 607016 249292")).toBe("4607016249292");
    expect(normalizeBarcode("1234-5678")).toBe("12345678");
    expect(normalizeBarcode("1234567")).toBeNull();
    expect(normalizeBarcode("12345678a")).toBeNull();
  });
});

describe("parseOffDraft", () => {
  const bare = { code: "4600000000017", product_name: "Хлебцы", product_name_ru: "Хлебцы ржаные", brands: "Пекарня, Другая", nutriments: { proteins_100g: 9 } };

  it("keeps a named product without kcal as a draft for an own product", () => {
    expect(parseOffProduct(bare, "ru")).toBeNull();
    expect(parseOffDraft(bare, "ru")).toEqual({ code: "4600000000017", name: "Хлебцы ржаные", brand: "Пекарня" });
  });

  it("leaves out products with kcal, without a name, and with kcal out of range", () => {
    expect(parseOffDraft({ ...bare, nutriments: { "energy-kj_100g": 1000 } }, "ru")).toBeNull();
    expect(parseOffDraft({ ...bare, nutriments: { "energy-kcal_100g": 5000 } }, "ru")).toBeNull();
    expect(parseOffDraft({ code: "4600000000017", nutriments: {} }, "ru")).toBeNull();
    expect(parseOffDraft(null, "ru")).toBeNull();
  });
});

describe("localNamesFirst", () => {
  it("puts products named in the interface language first and keeps OFF's order inside each part", () => {
    const items = [
      { code: "1", lang: "en" },
      { code: "2", lang: "ru" },
      { code: "3", lang: null },
      { code: "4", lang: "ru" },
    ];
    expect(localNamesFirst(items, "ru").map((item) => item.code)).toEqual(["2", "4", "1", "3"]);
  });
});
