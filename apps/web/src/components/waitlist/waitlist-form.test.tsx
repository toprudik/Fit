// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ru } from "@/i18n/dictionaries/ru";
import { renderWithProviders } from "@/test/render";
import { WaitlistForm } from "./waitlist-form";

const actions = vi.hoisted(() => ({ joinWaitlist: vi.fn(async () => ({ status: "done" as const })) }));
vi.mock("@/lib/waitlist/actions", () => actions);
// The Da-moment animates with the Web Animations API, which jsdom lacks.
vi.mock("@/components/brand/da-ring", () => ({ DaRing: () => null }));

const copy = ru.forTrainers;

describe("WaitlistForm", () => {
  it("signed out, asks for a contact and the consent", () => {
    renderWithProviders(<WaitlistForm signedIn={false} name={null} source={null} />);
    expect((screen.getByLabelText(copy.form.contact) as HTMLInputElement).required).toBe(true);
    expect(screen.getByText(copy.form.contactHint)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: copy.form.consent }) as HTMLInputElement).required).toBe(true);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  it("signed in, starts with the name and makes the contact optional", () => {
    renderWithProviders(<WaitlistForm signedIn name="Тест" source="ch_vk" />);
    expect((screen.getByLabelText(copy.form.name) as HTMLInputElement).value).toBe("Тест");
    expect((screen.getByLabelText(copy.form.contact) as HTMLInputElement).required).toBe(false);
    expect(screen.getByText(copy.form.contactOptional)).toBeTruthy();
  });

  it("sends the locale and the source, then shows that the trainer is on the list", async () => {
    renderWithProviders(<WaitlistForm signedIn={false} name={null} source="ch_vk" />);
    fireEvent.change(screen.getByLabelText(copy.form.name), { target: { value: "Тренер Тест" } });
    fireEvent.change(screen.getByLabelText(copy.form.contact), { target: { value: "@trainer_test" } });
    fireEvent.click(screen.getByRole("checkbox", { name: copy.form.consent }));
    fireEvent.click(screen.getByRole("button", { name: copy.form.submit }));
    await waitFor(() => expect(screen.getByRole("heading", { name: copy.joined.title })).toBeTruthy());
    const form = (actions.joinWaitlist.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(form.get("locale")).toBe("ru");
    expect(form.get("source")).toBe("ch_vk");
    expect(form.get("consent")).toBe("on");
  });
});
