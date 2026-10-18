// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountStoreForTests, setAccount } from "@/components/account/account-store";
import { DeviceTimeZone, TIME_ZONE_ENDPOINT } from "./device-time-zone";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const fetchMock = vi.fn();
const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const CLIENT = { status: "signed-in", name: "Аня", photoUrl: null, isTrainer: false, isAdmin: false, botBlocked: false, botUrl: "https://t.me/example_bot" } as const;

beforeEach(() => {
  resetAccountStoreForTests();
  setAccount(CLIENT);
  sessionStorage.clear();
  router.refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DeviceTimeZone", () => {
  it("sends the device zone and re-renders the screen when the account's zone changed", async () => {
    fetchMock.mockResolvedValue(Response.json({ changed: true }));
    render(<DeviceTimeZone />);

    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      TIME_ZONE_ENDPOINT,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ timeZone: deviceZone }) }),
    );
  });

  it("sends the zone once per tab", async () => {
    fetchMock.mockResolvedValue(Response.json({ changed: false }));
    render(<DeviceTimeZone />);
    await waitFor(() => expect(sessionStorage.getItem("dafit-time-zone-sent")).toBe(deviceZone));
    cleanup();

    render(<DeviceTimeZone />);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("sends nothing for a trainer or a signed-out visitor", () => {
    setAccount({ ...CLIENT, isTrainer: true });
    render(<DeviceTimeZone />);
    cleanup();
    setAccount({ status: "signed-out" });
    render(<DeviceTimeZone />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tries again on the next screen after a failed request", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    render(<DeviceTimeZone />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(sessionStorage.getItem("dafit-time-zone-sent")).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
