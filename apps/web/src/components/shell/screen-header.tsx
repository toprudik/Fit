"use client";

import { ChevronLeft, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/components/account/account-store";
import { PersonAvatar } from "@/components/ui/avatar";
import { useI18n } from "@/i18n/client";
import { useInTelegram, useTelegramBackButton } from "@/lib/telegram/mini-app";
import { cn } from "@/lib/utils";
import { useBack } from "./navigation-tracker";
import { useOptionalShell } from "./shell-context";

type ScreenHeaderProps = {
  /** The screen's name: the page's only h1. */
  title: string;
  /** Context under the title: a date, a client's name, "на проверке". */
  subtitle?: React.ReactNode;
  /** At most two `IconButton`s; everything else goes into a "More" menu. */
  actions?: React.ReactNode;
  /** Makes this a pushed screen: "Back" instead of the avatar, Telegram's BackButton in the Mini App. */
  back?: { fallbackHref: string };
};

const pressable = cn(
  "inline-flex min-h-11 cursor-pointer items-center select-none",
  "transition-[scale] duration-[var(--duration-instant)] ease-standard active:scale-[0.97]",
  "motion-reduce:transition-none motion-reduce:active:scale-100",
);

function BackButton({ onBack, className }: { onBack: () => void; className?: string }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={onBack} className={cn(pressable, "-ml-1.5 gap-0.5 pr-2 text-body text-accent-ink", className)}>
      <ChevronLeft aria-hidden size={24} strokeWidth={2} className="shrink-0" />
      {t.common.back}
    </button>
  );
}

function ProfileButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const account = useAccount();
  const signedIn = account.status === "signed-in";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t.common.profile}
      // 44px hit area around the 32px avatar, which lines up with the screen padding.
      className={cn(pressable, "-ml-1.5 size-11 justify-center rounded-full")}
    >
      <PersonAvatar
        name={signedIn ? account.name : ""}
        src={signedIn ? account.photoUrl : null}
        size={32}
        decorative
        // While the session loads the circle stays empty instead of flashing the signed-out icon.
        fallbackIcon={account.status === "loading" ? undefined : User}
      />
    </button>
  );
}

/**
 * Screen header (docs/design/components/LargeTitle). On a phone a bar sticks to the top with the
 * avatar (tab roots) or "Back" (pushed screens) and up to two actions; the large title scrolls under
 * it and comes back as a small centered title. The bar is clear at the top and turns to `material`
 * once content slides under it. From 768px on there is no bar: the side menu holds the avatar, and
 * the title is a plain `title-1` row with the actions.
 *
 * Render it as the first child of the screen's column: the bar sticks only within its parent.
 */
export function ScreenHeader({ title, subtitle, actions, back }: ScreenHeaderProps) {
  const shell = useOptionalShell();
  const inTelegram = useInTelegram();
  const goBack = useBack(back?.fallbackHref ?? "/");
  // In the Mini App, Telegram's own BackButton replaces ours (screens.md §1.5).
  useTelegramBackButton(back ? goBack : null);
  const showBack = back !== undefined && !inTelegram;

  const topRef = useRef<HTMLDivElement>(null);
  const titleEdgeRef = useRef<HTMLSpanElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [titleHidden, setTitleHidden] = useState(false);

  useEffect(() => {
    const top = topRef.current;
    const titleEdge = titleEdgeRef.current;
    if (!top || !titleEdge || typeof IntersectionObserver === "undefined") return;
    // Both markers are positioned in CSS, so the observers need no root margin: margins are ignored
    // in cross-origin frames, and Telegram Web runs the Mini App in one.
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === top) setScrolled(!entry.isIntersecting);
        else setTitleHidden(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      }
    });
    observer.observe(top);
    observer.observe(titleEdge);
    return () => observer.disconnect();
  }, []);

  const leading = showBack ? <BackButton onBack={goBack} /> : !back && shell ? <ProfileButton onOpen={shell.openProfile} /> : null;

  return (
    <>
      {/* Leaves the viewport as soon as the screen scrolls by a pixel. */}
      <div ref={topRef} aria-hidden className="h-0" />
      <div className="sticky top-0 z-[var(--z-header)] -mx-4 px-4 pt-[var(--safe-top)] md:hidden">
        <div
          aria-hidden
          className={cn(
            "material absolute inset-0 border-b border-line opacity-0",
            "transition-opacity duration-[var(--duration-fast)] ease-standard motion-reduce:transition-none",
            scrolled && "opacity-100",
          )}
        />
        <div className="relative flex min-h-11 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center">{leading}</div>
          <p
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-26 truncate text-center text-headline opacity-0",
              "transition-opacity duration-[var(--duration-fast)] ease-standard motion-reduce:transition-none",
              titleHidden && "opacity-100",
            )}
          >
            {title}
          </p>
          {actions ? <div className="-mr-2.5 flex items-center gap-1">{actions}</div> : null}
        </div>
      </div>

      <header data-slot="screen-title" className="flex items-center justify-between gap-4 pt-0.5 pb-4 md:pt-8 md:pb-6">
        <div className="min-w-0">
          {showBack ? <BackButton onBack={goBack} className="mb-2 hidden md:inline-flex" /> : null}
          <h1 className="relative text-large-title text-balance md:text-title-1">
            {title}
            {/*
             * Sits one bar height above the title's bottom edge, so it leaves the viewport exactly when
             * the title has slid under the bar.
             */}
            <span
              ref={titleEdgeRef}
              aria-hidden
              className="absolute top-[calc(100%-var(--size-touch)-var(--safe-top))] left-0 h-px w-px"
            />
          </h1>
          {subtitle ? <div className="mt-0.5 text-subhead text-ink-2">{subtitle}</div> : null}
        </div>
        {actions ? <div className="hidden shrink-0 items-center gap-2 md:flex">{actions}</div> : null}
      </header>
    </>
  );
}
