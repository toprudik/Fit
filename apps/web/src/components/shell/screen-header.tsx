"use client";

import { ChevronLeft, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/components/account/account-store";
import { PersonAvatar } from "@/components/ui/avatar";
import { useI18n } from "@/i18n/client";
import { useInTelegram, useTelegramBackButton, useTelegramTopControls } from "@/lib/telegram/mini-app";
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

function ProfileButton({ onOpen, className }: { onOpen: () => void; className?: string }) {
  const { t } = useI18n();
  const account = useAccount();
  const signedIn = account.status === "signed-in";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t.common.profile}
      // 44px hit area around the 32px avatar, which lines up with the screen padding.
      className={cn(pressable, "-ml-1.5 size-11 shrink-0 justify-center rounded-full", className)}
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
 * Screen header (docs/design/components/LargeTitle, .df-header). On a phone the whole header (the
 * bar with the avatar on tab roots or "Back" on pushed screens and up to two actions, the large
 * title and the subtitle) sits on one edge-to-edge `material` band. The bar sticks at
 * `size-header` (52px); the large title scrolls under it and comes back as a small centered title.
 * From 768px on there is no bar: the side menu holds the avatar, and the title is a plain `title-1`
 * row on `bg` with the actions.
 *
 * In the Telegram Mini App at fullscreen Telegram draws «Закрыть» and «⌄ ⋯» over the top of the app.
 * There the phone bar is that row: the avatar, the title and the subtitle sit between Telegram's
 * buttons, the title stays put while the page scrolls, and the actions get a row of their own under it.
 * A subtitle too long for the row is cut with an ellipsis.
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
  const underTelegramButtons = useTelegramTopControls();

  const titleEdgeRef = useRef<HTMLSpanElement>(null);
  const [titleHidden, setTitleHidden] = useState(false);

  useEffect(() => {
    const titleEdge = titleEdgeRef.current;
    if (!titleEdge || typeof IntersectionObserver === "undefined") return;
    // The marker is positioned in CSS, so the observer needs no root margin: margins are ignored in
    // cross-origin frames, and Telegram Web runs the Mini App in one.
    const observer = new IntersectionObserver(([entry]) => {
      setTitleHidden(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(titleEdge);
    return () => observer.disconnect();
  }, []);

  if (underTelegramButtons) {
    return (
      <TelegramTopBar
        title={title}
        subtitle={subtitle}
        actions={actions}
        onOpenProfile={!back && shell ? shell.openProfile : undefined}
      />
    );
  }

  const leading = showBack ? <BackButton onBack={goBack} /> : !back && shell ? <ProfileButton onOpen={shell.openProfile} /> : null;

  return (
    <>
      {/*
       * 8px above the 44px row make the 52px size-header; the focus ring of its buttons stays on screen.
       * Fixed, not sticky: the page's scroll-padding keeps focused content clear of this bar, and a
       * browser never scrolls to bring a fixed element into view, so focusing the avatar or Back
       * (keyboard, or a tap on Android) leaves the page where it was. The spacer below holds its place.
       */}
      <div
        className={cn(
          "material fixed inset-x-0 top-0 z-[var(--z-header)] md:hidden",
          "pt-[calc(var(--safe-top)+var(--space-2))] pr-[calc(var(--safe-right)+var(--space-4))] pl-[calc(var(--safe-left)+var(--space-4))]",
        )}
      >
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

      <div aria-hidden className="h-[calc(var(--size-header)+var(--safe-top))] md:hidden" />
      <header
        data-slot="screen-title"
        // On a phone the band goes on under the bar, edge to edge, and ends 12px below the subtitle.
        className="flex items-center justify-between gap-4 pb-3 max-md:material max-md:-mx-4 max-md:px-4 md:pt-6 md:pb-6"
      >
        <div className="min-w-0">
          {showBack ? <BackButton onBack={goBack} className="mb-2 hidden md:inline-flex" /> : null}
          {/* At 200% zoom one long word (Расписание, Настройки) wraps, hyphenated where the browser can, instead of overflowing. */}
          <h1 className="relative text-large-title text-balance break-words hyphens-auto md:text-title-1">
            {title}
            {/*
             * Sits one bar height above the title's bottom edge, so it leaves the viewport exactly when
             * the title has slid under the bar.
             */}
            <span
              ref={titleEdgeRef}
              aria-hidden
              className="absolute top-[calc(100%-var(--size-header)-var(--safe-top))] left-0 h-px w-px"
            />
          </h1>
          {subtitle ? <div className="mt-0.5 text-subhead text-ink-2">{subtitle}</div> : null}
        </div>
        {actions ? <div className="hidden shrink-0 items-center gap-2 md:flex">{actions}</div> : null}
      </header>
    </>
  );
}

/*
 * Room for Telegram's buttons: «Закрыть» ends 111px from the left edge and «⌄ ⋯» starts 88px from
 * the right (Telegram does not report their size). The row keeps clear of both, so it sits a few
 * pixels right of center, which leaves the date more room than a centered row would.
 */
const TELEGRAM_BUTTONS = { "--tg-buttons-left": "7.25rem", "--tg-buttons-right": "6rem" } as React.CSSProperties;

function TelegramTopBar({
  title,
  subtitle,
  actions,
  onOpenProfile,
}: Pick<ScreenHeaderProps, "title" | "subtitle" | "actions"> & { onOpenProfile?: () => void }) {
  return (
    <>
      <div
        className={cn(
          "material fixed inset-x-0 top-0 z-[var(--z-header)] md:hidden",
          "pt-[var(--tg-viewport-safe-area-inset-top,0px)] pr-[calc(var(--safe-right)+var(--tg-buttons-right))] pl-[calc(var(--safe-left)+var(--tg-buttons-left))]",
        )}
        style={TELEGRAM_BUTTONS}
      >
        <div data-slot="telegram-top-bar" className="flex h-[var(--tg-viewport-content-safe-area-inset-top)] items-center justify-center">
          <div className="flex min-w-0 items-center gap-1.5">
            {onOpenProfile ? <ProfileButton onOpen={onOpenProfile} className="ml-0" /> : null}
            <div className={cn("min-w-0", !onOpenProfile && "text-center")}>
              <h1 className="truncate text-headline">{title}</h1>
              {subtitle ? <div className="truncate text-footnote text-ink-2">{subtitle}</div> : null}
            </div>
          </div>
        </div>
      </div>

      <div aria-hidden className="h-[var(--safe-top)] md:hidden" />
      {/* From 768px the header is the usual title row; on a phone only the actions stay here. */}
      <header
        data-slot="screen-title"
        className={cn(
          "flex items-center justify-between gap-4 md:pt-6 md:pb-6",
          actions ? "max-md:material max-md:-mx-4 max-md:justify-end max-md:px-4 max-md:pb-1.5" : "max-md:hidden",
        )}
      >
        <div className="min-w-0 max-md:hidden">
          <h1 className="text-title-1 text-balance break-words hyphens-auto">{title}</h1>
          {subtitle ? <div className="mt-0.5 text-subhead text-ink-2">{subtitle}</div> : null}
        </div>
        {actions ? <div className="-mr-2.5 flex shrink-0 items-center gap-1 md:mr-0 md:gap-2">{actions}</div> : null}
      </header>
    </>
  );
}
