import { describe, expect, it } from "vitest";
import { documentPath, documentProblem, MAX_DOCUMENT_BYTES } from "./documents";

describe("documentProblem", () => {
  it("accepts JPG, PNG and PDF up to 10 MB", () => {
    expect(documentProblem({ type: "image/jpeg", size: 1 })).toBeNull();
    expect(documentProblem({ type: "image/png", size: MAX_DOCUMENT_BYTES })).toBeNull();
    expect(documentProblem({ type: "application/pdf", size: 2048 })).toBeNull();
  });

  it("names what is wrong", () => {
    expect(documentProblem({ type: "image/heic", size: 10 })).toBe("wrong-type");
    expect(documentProblem({ type: "image/png", size: MAX_DOCUMENT_BYTES + 1 })).toBe("too-big");
    expect(documentProblem({ type: "application/pdf", size: 0 })).toBe("empty");
  });
});

describe("documentPath", () => {
  it("puts the file in the trainer's folder under its id", () => {
    expect(documentPath("trainer-1", "doc-1", "application/pdf")).toBe("trainer-1/doc-1.pdf");
    expect(documentPath("trainer-1", "doc-2", "image/jpeg")).toBe("trainer-1/doc-2.jpg");
  });
});
