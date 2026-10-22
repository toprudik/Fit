// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { TemplateFields } from "./template-fields";

function fields() {
  return renderWithProviders(<TemplateFields currency="RUB" symbol="₽" values={null} error={() => false} />);
}

describe("TemplateFields", () => {
  it("says so when a session in a pack costs more than a single one", () => {
    fields();
    fireEvent.change(screen.getByLabelText("Цена разового занятия"), { target: { value: "2000" } });
    expect(screen.queryByText(/дороже разового/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Пакет на 20 занятий"), { target: { value: "50000" } });
    const note = screen.getByText(/Занятие в этом пакете дороже разового/);
    expect(note.textContent).toMatch(/2\s500\s₽ против 2\s000\s₽/);
    expect(screen.getByLabelText("Пакет на 20 занятий").getAttribute("aria-invalid")).toBeNull();
  });
});
