// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { ZONE_COOKIE, type Zone } from "@/lib/navigation/zones";
import { useShownZone } from "./use-shown-zone";

afterEach(() => {
  document.cookie = `${ZONE_COOKIE}=; Path=/; Max-Age=0`;
});

describe("useShownZone", () => {
  it("takes the zone from the path on zone screens", () => {
    document.cookie = `${ZONE_COOKIE}=client; Path=/`;
    const { result } = renderHook(() => useShownZone("trainer"));
    expect(result.current).toBe("trainer");
  });

  it("keeps the zone shown before when a screen without a zone opens", () => {
    document.cookie = `${ZONE_COOKIE}=client; Path=/`;
    const { result, rerender } = renderHook(({ zone }: { zone: Zone | null }) => useShownZone(zone), {
      initialProps: { zone: "trainer" },
    });

    rerender({ zone: null });
    expect(result.current).toBe("trainer");
  });

  it("falls back to the zone visited last, read from the cookie once hydrated", () => {
    document.cookie = `${ZONE_COOKIE}=trainer; Path=/`;
    const { result } = renderHook(() => useShownZone(null));
    expect(result.current).toBe("trainer");
  });

  it("opens the client zone when nothing was visited yet", () => {
    const { result } = renderHook(() => useShownZone(null));
    expect(result.current).toBe("client");
  });

  it("is unknown in the server render, so the frame shows no zone at all", () => {
    document.cookie = `${ZONE_COOKIE}=trainer; Path=/`;
    function Probe() {
      return <output>{useShownZone(null) ?? "none"}</output>;
    }
    expect(renderToString(<Probe />)).toContain("none");
  });
});
