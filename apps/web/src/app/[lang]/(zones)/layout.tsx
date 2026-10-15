import { AppShell } from "@/components/shell/app-shell";

/** Both zones share one shell, so switching zones keeps it mounted and only crossfades it. */
export default function ZonesLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
