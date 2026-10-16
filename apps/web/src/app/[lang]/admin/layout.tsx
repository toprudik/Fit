import { AdminShell } from "@/components/admin/admin-shell";

/**
 * /admin has its own frame instead of the zones' shell (screens.md §3.5). The proxy already answers 404 to
 * everyone but admins (ADM-12); every page checks the role again on its own.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
