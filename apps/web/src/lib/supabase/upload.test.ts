import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadToSignedUrl } from "./upload";

const file = () => new File([new Uint8Array([1, 2, 3])], "photo.jpg", { type: "image/jpeg" });

describe("uploadToSignedUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("puts the file to the signed upload URL with only the publishable key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await uploadToSignedUrl("progress-photos", "user-1/a.jpg", "tok en", file())).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://project.example/storage/v1/object/upload/sign/progress-photos/user-1/a.jpg?token=tok+en");
    expect(init.method).toBe("PUT");
    expect(init.headers).toMatchObject({ apikey: "sb_publishable_test", "content-type": "image/jpeg", "x-upsert": "false" });
    expect(init.headers).not.toHaveProperty("authorization");
  });

  it("drops a trailing slash from the project URL instead of sending //storage", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.example/");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await uploadToSignedUrl("verification", "user-1/c.png", "t", file());
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://project.example/storage/v1/object/upload/sign/verification/user-1/c.png?token=t");
  });

  it("reports a rejected or failed upload as false", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.example");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 400 })));
    expect(await uploadToSignedUrl("feedback", "p.png", "t", file())).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await uploadToSignedUrl("feedback", "p.png", "t", file())).toBe(false);
  });
});
