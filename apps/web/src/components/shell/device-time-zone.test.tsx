// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountStoreForTests, setAccount } from "@/components/account/account-store";
import { DeviceTimeZone, deviceTimeZone, TIME_ZONE_ENDPOINT } from "./device-time-zone";

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

  it("sends a fixed zone when the device reports an offset instead of a name (Android, zone set by hand)", async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...new Intl.DateTimeFormat().resolvedOptions(),
      timeZone: "+00:00",
    });
    fetchMock.mockResolvedValue(Response.json({ changed: false }));
    render(<DeviceTimeZone />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(TIME_ZONE_ENDPOINT, expect.objectContaining({ body: JSON.stringify({ timeZone: "UTC" }) }));
    vi.restoreAllMocks();
  });
});

describe("deviceTimeZone", () => {
  it("keeps a zone name", () => {
    expect(deviceTimeZone("Europe/Moscow")).toBe("Europe/Moscow");
  });

  it("turns a whole-hour offset into the fixed Etc zone, with the POSIX sign", () => {
    expect(deviceTimeZone("+00:00")).toBe("UTC");
    expect(deviceTimeZone("-00:00")).toBe("UTC");
    expect(deviceTimeZone("+03:00")).toBe("Etc/GMT-3");
    expect(deviceTimeZone("-05:00")).toBe("Etc/GMT+5");
    expect(deviceTimeZone("+14:00")).toBe("Etc/GMT-14");
    expect(deviceTimeZone("-12:00")).toBe("Etc/GMT+12");
  });

  it("sends nothing for an offset no fixed zone has", () => {
    expect(deviceTimeZone("+05:30")).toBeNull();
    expect(deviceTimeZone("-13:00")).toBeNull();
    expect(deviceTimeZone("+15:00")).toBeNull();
    expect(deviceTimeZone(undefined)).toBeNull();
    expect(deviceTimeZone("")).toBeNull();
  });
});
