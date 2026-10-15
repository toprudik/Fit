"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/client";
import { ProfilePanel } from "./profile-panel";

type ProfileSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The profile behind the avatar (screens.md §2.3): a bottom sheet on phones, a dialog from 768px.
 * It closes as soon as its content starts a navigation: another zone, settings or sign-in.
 */
export function ProfileSheet({ open, onOpenChange }: ProfileSheetProps) {
  const { t } = useI18n();
  const latest = useRef({ open, onOpenChange });
  useEffect(() => {
    latest.current = { open, onOpenChange };
  });

  // Sign-in leaves the shell, and Next.js hides it in React Activity mid-way through the sheet's exit
  // animation. A hidden exit never finishes: back on the screen, a closed sheet would stay over it,
  // scroll-locked and hiding the page from screen readers. So when hidden, drop the sheet at once:
  // a new instance has nothing left to animate.
  const [instance, setInstance] = useState(0);
  useLayoutEffect(
    () => () => {
      if (latest.current.open) latest.current.onOpenChange(false);
      setInstance((value) => value + 1);
    },
    [],
  );

  return (
    <Sheet key={instance} open={open} onOpenChange={onOpenChange} title={t.profile.title}>
      {/* The sheet is surface-1 itself, so its list group steps up to surface-2 to stay visible. */}
      <ProfilePanel groupSurface="raised" onNavigate={() => onOpenChange(false)} />
    </Sheet>
  );
}
