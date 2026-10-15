// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { Settings } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { ListGroup, ListRow } from "@/components/ui/list";
import { renderWithProviders } from "@/test/render";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const chevronIn = (element: HTMLElement) => element.querySelector("svg.lucide-chevron-right");

describe("ListRow", () => {
  it("renders a link with a chevron when given href", () => {
    renderWithProviders(<ListRow icon={Settings} title="Настройки" href="/settings" />);
    const link = screen.getByRole("link", { name: "Настройки" });
    expect(link.getAttribute("href")).toBe("/settings");
    expect(chevronIn(link)).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a button that calls onClick", () => {
    const onClick = vi.fn();
    renderWithProviders(<ListRow title="Выйти" subtitle="Из этого браузера" onClick={onClick} tone="danger" />);
    const button = screen.getByRole("button", { name: /^Выйти/ });
    expect(button.getAttribute("type")).toBe("button");
    expect(chevronIn(button)).not.toBeNull();
    expect(screen.queryByRole("link")).toBeNull();

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders a static row without a chevron when it leads nowhere", () => {
    const { container } = renderWithProviders(<ListRow title="Тема" value="Авто" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Авто")).not.toBeNull();
    expect(chevronIn(container)).toBeNull();
  });

  it("hides the chevron on request", () => {
    renderWithProviders(<ListRow title="Настройки" href="/settings" chevron={false} />);
    expect(chevronIn(screen.getByRole("link"))).toBeNull();
  });

  it("names the person once: the avatar is decorative next to the title", () => {
    renderWithProviders(<ListRow avatar={{ name: "Анна Смирнова" }} title="Анна Смирнова" href="/trainer/clients/1" />);
    expect(screen.getByRole("link", { name: "Анна Смирнова" })).not.toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("ListGroup", () => {
  it("renders the header as a heading above its rows", () => {
    renderWithProviders(
      <ListGroup header="Тема" footer="Авто берёт тему из Telegram.">
        <ListRow title="Светлая" />
      </ListGroup>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Тема" })).not.toBeNull();
    expect(screen.getByText("Авто берёт тему из Telegram.")).not.toBeNull();
  });
});
