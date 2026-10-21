import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));

const { announceDocumentsUpdate } = await import("./documents-actions");

beforeEach(() => {
  rpc.mockReset();
});

describe("announceDocumentsUpdate (право 15)", () => {
  it("queues the message for the day and says how many went", async () => {
    rpc.mockResolvedValueOnce({ data: 42, error: null });
    expect(await announceDocumentsUpdate("2026-12-01")).toEqual({ status: "done", queued: 42 });
    expect(rpc).toHaveBeenCalledWith("announce_documents_update", { p_effective_on: "2026-12-01" });
  });

  it("reports a day announced already as none queued", async () => {
    rpc.mockResolvedValueOnce({ data: 0, error: null });
    expect(await announceDocumentsUpdate("2026-12-01")).toEqual({ status: "done", queued: 0 });
  });

  it("refuses what is not a calendar day without asking the database", async () => {
    for (const raw of ["", "2026-02-31", "2026-13-01", "01.12.2026", "2026-12-01; drop"]) {
      expect(await announceDocumentsUpdate(raw)).toEqual({ status: "invalid-date" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("tells a day that is not ahead from other failures", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "date_not_ahead" } });
    expect(await announceDocumentsUpdate("2026-10-21")).toEqual({ status: "date-not-ahead" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "admins only" } });
    expect(await announceDocumentsUpdate("2026-12-01")).toEqual({ status: "failed" });
    error.mockRestore();
  });
});
