// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { Plus } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { renderWithProviders } from "@/test/render";

const hapticImpact = vi.hoisted(() => vi.fn());
vi.mock("@/lib/telegram/mini-app", () => ({ hapticImpact }));

beforeEach(() => hapticImpact.mockClear());

describe("Button", () => {
  it("is a plain button by default, so it never submits a form by accident", () => {
    renderWithProviders(<Button>Записаться</Button>);
    expect(screen.getByRole("button", { name: "Записаться" }).getAttribute("type")).toBe("button");
  });

  it("vibrates on press only for the primary variant", () => {
    const onClick = vi.fn();
    renderWithProviders(
      <>
        <Button onClick={onClick}>Записаться</Button>
        <Button variant="secondary">Позже</Button>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Записаться" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(hapticImpact).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Позже" }));
    expect(hapticImpact).toHaveBeenCalledOnce();
  });

  it("while loading is busy and disabled, and keeps its name", () => {
    renderWithProviders(<Button loading>Сохранить</Button>);
    const button = screen.getByRole("button", { name: "Сохранить" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.querySelector("[data-slot=spinner]")).not.toBeNull();
  });

  it("puts the spinner in place of the icon while loading", () => {
    renderWithProviders(
      <Button icon={Plus} loading>
        Добавить
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Добавить" });
    expect(button.querySelector("svg.lucide-plus")).toBeNull();
    expect(button.querySelector("[data-slot=spinner]")).not.toBeNull();
  });

  it("with asChild renders the child link with the icon and the button look", () => {
    // A plain <a> stands in for next/link here; ListRow's tests mock next/link the same way.
    const href = "/trainer/sessions/new";
    renderWithProviders(
      <Button asChild icon={Plus} variant="secondary">
        <a href={href}>Занятие</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Занятие" });
    expect(link.getAttribute("href")).toBe(href);
    expect(link.querySelector("svg.lucide-plus")).not.toBeNull();
    expect(link.className).toContain("bg-surface-2");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("SkeletonRows", () => {
  it("announces the loading state with its label", () => {
    renderWithProviders(<SkeletonRows rows={2} label="Загрузка" />);
    const status = screen.getByRole("status", { name: "Загрузка" });
    expect(status.getAttribute("aria-busy")).toBe("true");
  });
});
