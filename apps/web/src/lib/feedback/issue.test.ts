import { describe, expect, it } from "vitest";
import { feedbackIssue } from "./issue";

const row = {
  id: "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b",
  kind: "bug" as const,
  body: "Не открывается запись на четверг\nНажимаю, и ничего",
  zone: "client" as const,
  route: "/client/bookings",
  platform: "tma-ios",
  app_version: "abc1234",
  locale: "ru" as const,
  theme: null,
  attachment_paths: ["u/6f1c/1.png", "u/6f1c/2.png"],
};

describe("feedbackIssue", () => {
  it("titles the issue by kind and the first line, and labels it needs-triage", () => {
    const issue = feedbackIssue(row);
    expect(issue.title).toBe("Bug: Не открывается запись на четверг");
    expect(issue.labels).toEqual(["needs-triage"]);
  });

  it("quotes the text and lists the context with the feedback id", () => {
    const { body } = feedbackIssue(row);
    expect(body).toContain("> Не открывается запись на четверг\n> Нажимаю, и ничего");
    expect(body).toContain(`| Feedback id | ${row.id} |`);
    expect(body).toContain("| Screen | /client/bookings |");
    expect(body).toContain("| Screenshots | 2 (in /admin/feedback) |");
    expect(body).not.toContain("Theme");
  });

  it("keeps the screenshot paths, which hold the user id, out of the issue (FDBK-2)", () => {
    expect(feedbackIssue(row).body).not.toContain("u/6f1c");
  });

  it("cuts a long first line", () => {
    const title = feedbackIssue({ ...row, kind: "idea", body: "а".repeat(200) }).title;
    expect(title).toHaveLength("Idea: ".length + 80);
    expect(title.endsWith("…")).toBe(true);
  });
});
