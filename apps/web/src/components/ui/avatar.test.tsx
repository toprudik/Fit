// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { User } from "lucide-react";
import { describe, expect, it } from "vitest";
import { initials, PersonAvatar } from "@/components/ui/avatar";
import { renderWithProviders } from "@/test/render";

describe("initials", () => {
  it.each([
    ["Анна Смирнова", "АС"],
    ["олег петров", "ОП"],
    ["David", "D"],
    ["Мария Лебедева Ивановна", "МЛ"],
    ["  Игорь   Ким  ", "ИК"],
    ["Анна-Мария Смирнова", "АС"],
  ])("%s → %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it("skips words without letters, such as emoji", () => {
    expect(initials("🏋️ Анна Смирнова")).toBe("АС");
    expect(initials("(Анна) Смирнова")).toBe("АС");
  });

  it("returns an empty string for an empty or blank name", () => {
    expect(initials("")).toBe("");
    expect(initials("   ")).toBe("");
    expect(initials("🏋️")).toBe("");
  });
});

describe("PersonAvatar", () => {
  it("shows the initials and is labelled with the full name", () => {
    renderWithProviders(<PersonAvatar name="Анна Смирнова" />);
    const avatar = screen.getByRole("img", { name: "Анна Смирнова" });
    expect(avatar.textContent).toBe("АС");
  });

  it("is hidden from screen readers when decorative", () => {
    renderWithProviders(<PersonAvatar name="Анна Смирнова" decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("АС").closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("shows the fallback icon when there is no name", () => {
    const { container } = renderWithProviders(<PersonAvatar name="" fallbackIcon={User} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg.lucide-user")).not.toBeNull();
  });
});
