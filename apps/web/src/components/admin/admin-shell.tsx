"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { Suspense } from "react";
import { DaMark } from "@/components/brand/da-mark";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { ADMIN_SECTIONS } from "./admin-nav";

const itemClass = cn(
  "flex h-11 items-center gap-3 rounded-sm px-3 text-subhead text-ink select-none",
  "transition-[scale,background-color] duration-[var(--duration-instant)] ease-standard active:scale-[0.97]",
  "motion-reduce:transition-none motion-reduce:active:scale-100",
);

/** The sections, the current one marked; `undefined` marks none. */
function SectionList({ segment }: { segment: string | null | undefined }) {
  const { t } = useI18n();
  return (
    <ul className="flex flex-col gap-0.5">
      {ADMIN_SECTIONS.map(({ id, href, segment: own, icon: Icon }) => {
        const active = own === segment;
        return (
          <li key={id}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(itemClass, active ? "bg-surface-1 font-semibold" : "font-medium hover:bg-surface-3")}
            >
              <Icon aria-hidden size={22} strokeWidth={active ? 2.25 : 1.75} className={cn("shrink-0", active && "text-accent-ink")} />
              <span className="min-w-0 truncate">{t.adminShell.sections[id]}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function CurrentSectionList() {
  return <SectionList segment={useSelectedLayoutSegment()} />;
}

/**
 * The admin section's own frame (screens.md §3.5): a side menu with the sections from 768px on, and no tab
 * bar. On a phone there is no menu: the overview lists the sections and every screen has a way back to it.
 * The current section comes from the layout segment, which the server and the browser read the same way
 * (the proxy's locale rewrite never shows up in it, ADR 0015).
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const copy = t.adminShell;

  return (
    <>
      <a
        href="#main"
        className={cn(
          "sr-only focus:not-sr-only focus:fixed focus:top-[calc(var(--safe-top)+var(--space-2))] focus:left-4",
          "focus:z-[var(--z-toast)] focus:rounded-sm focus:bg-inverse focus:px-4 focus:py-2.5",
          "focus:text-subhead focus:font-semibold focus:text-on-inverse",
        )}
      >
        {t.common.skipToContent}
      </a>
      <div className="min-h-dvh pr-[var(--safe-right)] pl-[var(--safe-left)] md:flex">
        <div
          className={cn(
            "sticky top-0 hidden h-dvh w-58 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-bg px-3 md:flex",
            "pt-[max(var(--space-3),var(--safe-top))] pb-[max(var(--space-4),var(--safe-bottom))]",
          )}
        >
          <div className="flex h-11 shrink-0 items-center gap-2.5 px-2.5">
            <DaMark className="size-7.5" />
            <span className="text-title-3 font-bold">{copy.title}</span>
          </div>
          <nav aria-label={copy.nav} className="flex flex-1 flex-col">
            {/* A dynamic segment (a user's id) is known only at request time: the list prerenders unmarked. */}
            <Suspense fallback={<SectionList segment={undefined} />}>
              <CurrentSectionList />
            </Suspense>
            <ul className="mt-auto flex flex-col pt-4">
              <li>
                <Link href="/" className={cn(itemClass, "font-medium hover:bg-surface-3")}>
                  <ArrowLeft aria-hidden size={22} strokeWidth={1.75} className="shrink-0" />
                  <span className="min-w-0 truncate">{copy.backToApp}</span>
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-x-clip pb-[var(--safe-bottom)] outline-none">
          {children}
        </main>
      </div>
    </>
  );
}
