"use client";

import { ChevronLeft, ChevronRight, User } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
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

function ProfileButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const account = useAccount();
  const signedIn = account.status === "signed-in";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t.common.profile}
      // 44px hit area around the 32px avatar; the bar's right column pulls it to the screen padding.
      className={cn(pressable, "size-11 shrink-0 justify-center rounded-full")}
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

/*
 * Room for Telegram's buttons in the Mini App at fullscreen: «Закрыть» ends 111px from the left edge
 * and «⌄ ⋯» starts 88px from the right (Telegram does not report their size). The bar keeps clear of
 * the wider one on both sides, so the title sits in the middle of the screen (Rudik 22.10).
 */
const TELEGRAM_BUTTONS = { "--tg-buttons-left": "7.25rem", "--tg-buttons-right": "7.25rem" } as React.CSSProperties;

/**
 * Gives both side columns of the bar the width of the wider one, so the title stays in the middle of
 * the screen even when the actions and the avatar on the right take more room than "Back" on the left.
 * Returns the refs for the content of the left and the right column.
 */
function useEqualSides() {
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const [start, end] = [left.current, right.current];
    const bar = start?.closest<HTMLElement>("[data-slot=screen-bar]");
    if (!start || !end || !bar || typeof ResizeObserver === "undefined") return;
    // The right column reaches 10px into the bar's padding (-mr-2.5), so its track is that much narrower.
    const measure = () => bar.style.setProperty("--bar-side", `${Math.max(start.offsetWidth, end.offsetWidth - 10)}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(start);
    observer.observe(end);
    measure();
    return () => observer.disconnect();
  }, []);
  return [left, right] as const;
}

/**
 * Screen header (docs/design/components/LargeTitle, .df-header). On a phone it is one bar on an
 * edge-to-edge `material` band that stays put while the page scrolls: the title and the subtitle in
 * the middle, "Back" on the left of a pushed screen, the actions and the avatar on the right. A title
 * or subtitle too long for the bar is cut with an ellipsis. From 768px on there is no bar: the side
 * menu holds the avatar, and the title is a plain `title-1` row on `bg` with the actions.
 *
 * In the Telegram Mini App at fullscreen Telegram draws «Закрыть» and «⌄ ⋯» over the top of the app,
 * and the bar is that row: the title and the subtitle sit between Telegram's buttons, and the actions
 * get a row of their own under it. The avatar moves to the tab bar (PROFILE_TAB), and the root of
 * that tab is titled «Профиль» and starts with a row that opens the profile sheet.
 *
 * Render it as the first child of the screen's column.
 */
export function ScreenHeader({ title, subtitle, actions, back }: ScreenHeaderProps) {
  const { t } = useI18n();
  const shell = useOptionalShell();
  const inTelegram = useInTelegram();
  const goBack = useBack(back?.fallbackHref ?? "/");
  // In the Mini App, Telegram's own BackButton replaces ours (screens.md §1.5).
  useTelegramBackButton(back ? goBack : null);
  const showBack = back !== undefined && !inTelegram;
  const underTelegramButtons = useTelegramTopControls();

  const onProfileTab = underTelegramButtons && !back && shell?.onProfileTab === true;
  const barTitle = onProfileTab ? t.common.profile : title;
  const avatar = !underTelegramButtons && !back && shell ? <ProfileButton onOpen={shell.openProfile} /> : null;
  // Under Telegram's buttons the actions have no room in the bar and get a row of their own.
  const actionsRow = underTelegramButtons && Boolean(actions);
  const [leftSide, rightSide] = useEqualSides();

  return (
    <>
      {/*
       * Fixed, not sticky: the page's scroll-padding keeps focused content clear of this bar, and a
       * browser never scrolls to bring a fixed element into view, so focusing the avatar or Back
       * (keyboard, or a tap on Android) leaves the page where it was. The spacer below holds its place.
       */}
      <div
        className={cn(
          "material fixed inset-x-0 top-0 z-[var(--z-header)] md:hidden",
          underTelegramButtons
            ? "pt-[var(--tg-viewport-safe-area-inset-top,0px)] pr-[calc(var(--safe-right)+var(--tg-buttons-right))] pl-[calc(var(--safe-left)+var(--tg-buttons-left))]"
            : // 8px above the 44px row make the 52px size-header; the focus ring of its buttons stays on screen.
              "pt-[calc(var(--safe-top)+var(--space-2))] pr-[calc(var(--safe-right)+var(--space-4))] pl-[calc(var(--safe-left)+var(--space-4))]",
        )}
        style={underTelegramButtons ? TELEGRAM_BUTTONS : undefined}
      >
        <div
          data-slot="screen-bar"
          className={cn(
            // The side columns share what the title leaves, so a short title stays in the middle; they never
            // shrink below Back or the avatar, so a long title is cut instead of sliding under them.
            "grid grid-cols-[minmax(max-content,1fr)_minmax(0,auto)_minmax(max-content,1fr)] items-center gap-2",
            underTelegramButtons ? "h-[var(--tg-viewport-content-safe-area-inset-top)]" : "min-h-11",
          )}
        >
          <div className="flex min-w-[var(--bar-side,0px)] items-center">
            <div ref={leftSide} className="flex w-max items-center">
              {showBack ? <BackButton onBack={goBack} /> : null}
            </div>
          </div>
          <div className="min-w-0 text-center">
            <h1 className="truncate text-headline">{barTitle}</h1>
            {subtitle ? <div className="truncate text-footnote text-ink-2">{subtitle}</div> : null}
          </div>
          <div className="-mr-2.5 flex min-w-[calc(var(--bar-side,0px)+0.625rem)] items-center justify-end">
            <div ref={rightSide} className="flex w-max items-center gap-1">
              {underTelegramButtons ? null : actions}
              {avatar}
            </div>
          </div>
        </div>
      </div>

      <div
        aria-hidden
        className={cn("md:hidden", underTelegramButtons ? "h-[var(--safe-top)]" : "h-[calc(var(--size-header)+var(--safe-top))]")}
      />
      {onProfileTab && shell ? <ProfileRow onOpen={shell.openProfile} /> : null}
      {/* From 768px the header is the usual title row; on a phone only the actions row under Telegram's buttons stays here. */}
      <header
        data-slot="screen-title"
        className={cn(
          "flex items-center justify-between gap-4 md:pt-6 md:pb-6",
          actionsRow ? "max-md:material max-md:-mx-4 max-md:justify-end max-md:px-4 max-md:pb-1.5" : "max-md:hidden",
        )}
      >
        <div className="min-w-0 max-md:hidden">
          {showBack ? <BackButton onBack={goBack} className="mb-2" /> : null}
          {/* At 200% zoom one long word (Расписание, Настройки) wraps, hyphenated where the browser can, instead of overflowing. */}
          <h1 className="text-title-1 text-balance break-words hyphens-auto">{title}</h1>
          {subtitle ? <div className="mt-0.5 text-subhead text-ink-2">{subtitle}</div> : null}
        </div>
        {actions ? <div className="-mr-2.5 flex shrink-0 items-center gap-1 md:mr-0 md:gap-2">{actions}</div> : null}
      </header>
    </>
  );
}

/** The first row of the profile tab's root under Telegram's buttons: who is signed in; opens the profile sheet. */
function ProfileRow({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const account = useAccount();
  const signedIn = account.status === "signed-in";
  return (
    <div className="material -mx-4 px-4 pt-1 pb-3 md:hidden">
      <button
        type="button"
        onClick={onOpen}
        className={cn(pressable, "w-full gap-3 rounded-lg bg-surface-2 px-3 py-2.5 text-left")}
      >
        <PersonAvatar
          name={signedIn ? account.name : ""}
          src={signedIn ? account.photoUrl : null}
          size={40}
          decorative
          fallbackIcon={account.status === "loading" ? undefined : User}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-headline">{signedIn && account.name ? account.name : t.common.profile}</span>
          <span className="block truncate text-footnote text-ink-2">{t.profile.open}</span>
        </span>
        <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-3" />
      </button>
    </div>
  );
}
