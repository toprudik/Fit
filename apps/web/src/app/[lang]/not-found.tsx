import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/server";

export default async function NotFound() {
  const t = await getDictionary();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 pt-[var(--safe-top)] pb-[var(--safe-bottom)]">
      <EmptyState
        icon={SearchX}
        title={t.notFound.title}
        description={t.notFound.text}
        action={
          <Button asChild>
            <Link href="/">{t.notFound.action}</Link>
          </Button>
        }
      />
    </main>
  );
}
