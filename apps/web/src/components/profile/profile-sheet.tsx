"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
// From the context module, not app-shell.tsx: AppShell renders this sheet, so that would be an import cycle.
import { useShell } from "@/components/shell/shell-context";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/client";
import { ProfilePanel } from "./profile-panel";

type ProfileSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The profile behind the header avatar (screens.md §2.3): a bottom sheet on phones, a dialog from
 * 768px. It closes whenever its content navigates: switching zones here, or leaving the zones for
 * settings or sign-in.
 */
export function ProfileSheet({ open, onOpenChange }: ProfileSheetProps) {
  const { t } = useI18n();
  const { zone } = useShell();
  const latest = useRef({ open, onOpenChange });
  useEffect(() => {
    latest.current = { open, onOpenChange };
  });

  // Opening /settings from here hides the whole zone layout (Next.js keeps it in React Activity
  // instead of unmounting). Close the sheet as that happens, so going back doesn't find it open.
  useLayoutEffect(
    () => () => {
      if (latest.current.open) latest.current.onOpenChange(false);
    },
    [],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t.profile.title}>
      {/* The sheet is surface-1 itself, so its list group steps up to surface-2 to stay visible. */}
      <div className="[&_[data-slot=list-group]>.rounded-lg]:bg-surface-2">
        <ProfilePanel zone={zone} onNavigate={() => onOpenChange(false)} />
      </div>
    </Sheet>
  );
}
