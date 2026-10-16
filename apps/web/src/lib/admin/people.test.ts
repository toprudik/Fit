import { describe, expect, it } from "vitest";
import { personName } from "./people";

describe("personName", () => {
  it("joins the first and last name", () => {
    expect(personName({ first_name: "Анна", last_name: " Смирнова ", username: "anna" }, "—")).toBe("Анна Смирнова");
  });

  it("falls back to the username, then to the fallback", () => {
    expect(personName({ first_name: " ", last_name: null, username: "anna" }, "Без имени")).toBe("@anna");
    expect(personName({ first_name: null, last_name: null, username: null }, "Без имени")).toBe("Без имени");
    expect(personName(null, "удалённый аккаунт")).toBe("удалённый аккаунт");
  });
});
