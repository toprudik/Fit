import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const APP_URL = "https://fit.example";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: APP_URL } }));

/**
 * The PNG renderer is replaced: the test keeps the element and the options it got and answers with their
 * headers, so the route's own work (id, 404, theme, language, QR, headers) is checked without drawing pixels.
 */
const rendered = vi.hoisted(() => ({ element: null as unknown, options: null as null | Record<string, unknown> }));
vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor(element: unknown, options: { headers?: Record<string, string> } & Record<string, unknown>) {
      super("png", { headers: { "content-type": "image/png", ...options.headers } });
      rendered.element = element;
      rendered.options = options;
    }
  },
}));
const qr = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("qrcode", () => ({
  default: {
    toDataURL: async (url: string) => {
      qr.urls.push(url);
      return "data:image/png;base64,QR";
    },
  },
}));

/** What public.story_card answers, and the calls it got. */
const rpc = vi.hoisted(() => ({
  answer: { data: null as unknown, error: null as { code: string } | null },
  calls: [] as { name: string; args: Record<string, unknown> }[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpc.calls.push({ name, args });
      return rpc.answer;
    },
  }),
}));

const { GET } = await import("./route");

const ID = "0b9d6c1e-1f2a-4c3b-8d4e-5f6a7b8c9d0e";

const get = (id: string, search = "") => GET(new Request(`${APP_URL}/api/story/${id}${search}`), { params: Promise.resolve({ id }) });

/** Every string the card draws, in order. */
function texts(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (node && typeof node === "object" && "props" in node) return texts((node as ReactElement<{ children?: ReactNode }>).props.children);
  return [];
}

/** The card's background color, the root element's style. */
const background = () => (rendered.element as ReactElement<{ style: { backgroundColor: string } }>).props.style.backgroundColor;

beforeEach(() => {
  rpc.answer = { data: { kind: "sessions", month: "2026-09-01", data: { count: 12, slug: "test-coach" } }, error: null };
  rpc.calls = [];
  qr.urls = [];
  rendered.element = null;
  rendered.options = null;
});

describe("GET /api/story/[id]", () => {
  it("draws the card as a 1080×1920 PNG that can be cached for an hour", async () => {
    const response = await get(ID);

    expect(response.status).toBe(200);
    expect(rpc.calls).toEqual([{ name: "story_card", args: { p_id: ID } }]);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(rendered.options).toMatchObject({ width: 1080, height: 1920 });
    // All three font cuts were read from src/fonts/story.
    const fonts = rendered.options?.fonts as { name: string; data: Buffer }[];
    expect(fonts.map((font) => font.name)).toEqual(["Onest", "Onest", "Tektur Narrow"]);
    expect(fonts.every((font) => font.data.length > 0)).toBe(true);
  });

  it("draws in Russian on the dark theme by default", async () => {
    await get(ID);

    expect(background()).toBe("#000000");
    expect(texts(rendered.element)).toContain("12");
    expect(texts(rendered.element).join(" ")).toMatch(/Сентябрь/);
  });

  it("follows ?lang=en and ?theme=light", async () => {
    await get(ID, "?lang=en&theme=light");

    expect(background()).toBe("#f2f3f5");
    expect(texts(rendered.element).join(" ")).toMatch(/September/);
  });

  it("ignores an unknown language or theme", async () => {
    await get(ID, "?lang=de&theme=neon");

    expect(background()).toBe("#000000");
    expect(texts(rendered.element).join(" ")).toMatch(/Сентябрь/);
  });

  it("puts a QR to the trainer's showcase on the card when it has one", async () => {
    await get(ID);

    expect(qr.urls).toEqual([`${APP_URL}/trainers/test-coach`]);
    expect(texts(rendered.element)).toContain("fit.example/trainers/test-coach");
  });

  it("draws no QR without a showcase", async () => {
    rpc.answer = { data: { kind: "sessions", month: "2026-09-01", data: { count: 3 } }, error: null };
    const response = await get(ID);

    expect(response.status).toBe(200);
    expect(qr.urls).toEqual([]);
  });

  it.each(["not-a-uuid", "0B9D6C1E-1F2A-4C3B-8D4E-5F6A7B8C9D0E", `${ID}x`, "' or 1=1 --"])("answers 404 to the id %j before reaching the database", async (id) => {
    const response = await get(id);

    expect(response.status).toBe(404);
    expect(rpc.calls).toEqual([]);
    expect(rendered.element).toBeNull();
  });

  it.each([
    ["an unknown or expired card", null],
    ["a card of an unknown shape", { kind: "selfies", month: "2026-09-01", data: {} }],
    ["a showcase address the database would not accept", { kind: "sessions", month: "2026-09-01", data: { count: 1, slug: "javascript:alert(1)" } }],
  ])("answers 404 for %s", async (_name, data) => {
    rpc.answer = { data, error: null };
    const response = await get(ID);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(rendered.element).toBeNull();
  });

  it("answers 503 when the database fails and logs only the code", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.answer = { data: null, error: { code: "57014" } };
    const response = await get(ID);

    expect(response.status).toBe(503);
    expect(error).toHaveBeenCalledWith("reading a story card failed", "57014");
    expect(rendered.element).toBeNull();
  });
});
