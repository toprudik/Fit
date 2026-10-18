import { AppShell } from "@/components/shell/app-shell";
import { DeviceTimeZone } from "@/components/shell/device-time-zone";

/** Both zones share one shell, so switching zones keeps it mounted and only crossfades it. */
export default function ZonesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DeviceTimeZone />
      <AppShell>{children}</AppShell>
    </>
  );
}
